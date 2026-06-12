import { useCallback, useEffect, useRef, useState } from 'react';
import { InterviewerAvatar, type AvatarState } from '../components/InterviewerAvatar';
import { LevelRing } from '../components/LevelRing';
import { QuestionText } from '../components/QuestionText';
import {
  answerWithAudio,
  answerWithText,
  endSession,
  type AnswerResponse,
  type SessionView,
} from '../lib/api';
import { createMicMeter, isMuted, playAdvanceTick, setMuted, type MicMeter } from '../lib/audio';
import { setMood } from '../lib/mood';
import { startRecording, type ActiveRecording } from '../lib/recorder';
import { getTtsLevel, speak, stopSpeaking } from '../lib/tts';

type TurnPhase = 'speaking' | 'ready' | 'recording' | 'processing';

interface Props {
  session: SessionView;
  micWorks: boolean;
  /** Skip speaking the first question (e.g. when resuming after a refresh). */
  resumed?: boolean;
  onFinished: (closingLine: string) => void;
}

const phaseToAvatar: Record<TurnPhase, AvatarState> = {
  speaking: 'speaking',
  ready: 'idle',
  recording: 'listening',
  processing: 'thinking',
};

export function InterviewRoom({ session, micWorks, resumed, onFinished }: Props) {
  const [phase, setPhase] = useState<TurnPhase>(resumed ? 'ready' : 'speaking');
  const [prompt, setPrompt] = useState(session.currentPrompt);
  const [isFollowUp, setIsFollowUp] = useState(session.currentPromptIsFollowUp);
  const [questionIndex, setQuestionIndex] = useState(session.questionIndex);
  const [transcript, setTranscript] = useState(session.lastTranscript);
  const [speechSeconds, setSpeechSeconds] = useState<number | null>(resumed ? 0 : null);
  const [notice, setNotice] = useState('');
  const [showType, setShowType] = useState(!micWorks);
  const [typed, setTyped] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [failedClip, setFailedClip] = useState<Blob | null>(null);
  const [micMeter, setMicMeter] = useState<MicMeter | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [cinematic, setCinematic] = useState(!resumed);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const micMeterRef = useRef<MicMeter | null>(null);
  const startedRef = useRef(false);

  const total = session.total;
  const name = session.interviewerName;

  const sayPrompt = useCallback(async (text: string) => {
    setSpeechSeconds(null);
    setPhase('speaking');
    await speak(text, (d) => setSpeechSeconds(d));
    setPhase('ready');
  }, []);

  // Cinematic start beat: dimmed backdrop while the orb settles in and the
  // first question reveals word-by-word with the voice.
  useEffect(() => {
    if (!cinematic) return;
    const t = window.setTimeout(() => setCinematic(false), 1600);
    return () => window.clearTimeout(t);
  }, [cinematic]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!resumed) {
      void speak(session.currentPrompt, (d) => setSpeechSeconds(d)).then(() => setPhase('ready'));
    }
    return () => {
      stopSpeaking();
      recordingRef.current?.cancel();
      micMeterRef.current?.dispose();
    };
  }, [resumed, session.currentPrompt]);

  // Ambient mood follows who is holding the room.
  useEffect(() => {
    setMood(phase === 'recording' ? 'student' : phase === 'speaking' ? 'asha' : 'neutral');
    return () => setMood('neutral');
  }, [phase]);

  function stopMicMeter() {
    micMeterRef.current?.dispose();
    micMeterRef.current = null;
    setMicMeter(null);
  }

  function applyResult(result: AnswerResponse) {
    setTranscript(result.transcript);
    setFailedClip(null);
    if (result.retry) {
      setNotice("I didn't catch that — try again, or type your answer instead.");
      setPhase('ready');
      return;
    }
    setNotice('');
    setQuestionIndex(result.questionIndex);
    setIsFollowUp(result.isFollowUp);
    if (result.done) {
      onFinished(result.nextPrompt);
      return;
    }
    playAdvanceTick();
    setPrompt(result.nextPrompt);
    void sayPrompt(result.nextPrompt);
  }

  async function startAnswer() {
    setNotice('');
    stopSpeaking();
    try {
      const rec = await startRecording(() => void finishAnswer());
      recordingRef.current = rec;
      const meter = createMicMeter(rec.stream);
      micMeterRef.current = meter;
      setMicMeter(meter);
      setPhase('recording');
    } catch {
      setNotice('Microphone access was blocked — no problem, type your answer instead.');
      setShowType(true);
      setPhase('ready');
    }
  }

  async function uploadClip(blob: Blob) {
    setPhase('processing');
    try {
      // One silent auto-retry before surfacing an error.
      let result: AnswerResponse;
      try {
        result = await answerWithAudio(session.id, blob);
      } catch {
        result = await answerWithAudio(session.id, blob);
      }
      applyResult(result);
    } catch (err) {
      setFailedClip(blob);
      setNotice(
        err instanceof Error && err.message.length < 120
          ? err.message
          : "That didn't upload. Your answer is saved here — hit Try again.",
      );
      setPhase('ready');
    }
  }

  async function finishAnswer() {
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    stopMicMeter();
    const blob = await rec.stop();
    await uploadClip(blob);
  }

  async function sendTyped() {
    if (!typed.trim()) return;
    setPhase('processing');
    setNotice('');
    try {
      const result = await answerWithText(session.id, typed.trim());
      setTyped('');
      setShowType(!micWorks);
      applyResult(result);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not send that — try again.');
      setPhase('ready');
    }
  }

  async function endEarly() {
    stopSpeaking();
    recordingRef.current?.cancel();
    stopMicMeter();
    setPhase('processing');
    try {
      await endSession(session.id);
    } catch {
      // The wrap-up screen will retry report generation if needed.
    }
    onFinished(`Thanks for practicing with me today — ending here is completely fine.`);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  const statusLabel =
    phase === 'processing'
      ? transcript && failedClip === null
        ? `${name} is thinking…`
        : 'Catching every word…'
      : undefined;

  const avatarLevel =
    phase === 'speaking' ? getTtsLevel : phase === 'recording' && micMeter ? micMeter.read : undefined;

  return (
    <main className={`room enter ${cinematic ? 'room-cinematic' : ''}`}>
      {cinematic && <div className="start-dim" aria-hidden="true" />}

      {/* The Beam crosses the top of the stage as progress */}
      <div className="room-progress" aria-hidden="true">
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ transform: `scaleX(${(questionIndex + 1) / total})` }}
          />
          <span className="progress-glint" key={`glint-${questionIndex}`} />
        </div>
      </div>

      <div className="room-head">
        <span className="room-qnum" aria-hidden="true">
          {String(questionIndex + 1).padStart(2, '0')}
        </span>
        <div>
          <p className="screen-kicker" style={{ margin: 0 }}>
            {isFollowUp
              ? `Follow-up · Question ${questionIndex + 1} of ${total}`
              : `Question ${questionIndex + 1} of ${total}`}
          </p>
          <span className="beam" style={{ marginBottom: 0 }} />
        </div>
      </div>

      <div className="room-stage">
        <QuestionText key={prompt} text={prompt} speechSeconds={speechSeconds} />
        <div
          className={`room-orb ${cinematic ? 'orb-arrive' : ''}`}
          key={`inhale-${questionIndex}-${isFollowUp}`}
        >
          <InterviewerAvatar
            state={phaseToAvatar[phase]}
            name={name}
            statusLabel={statusLabel}
            getLevel={avatarLevel}
          />
        </div>
      </div>

      <div className="transcript-live">
        {transcript ? (
          <div className="card transcript-card beam-top" key={transcript}>
            <p className="label">What {name} heard</p>
            <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--text-secondary)' }}>
              {transcript}
            </p>
          </div>
        ) : (
          <p className="transcript-empty">
            Your words land here as {name} hears them — answer when you're ready.
          </p>
        )}
        {notice && (
          <p className="error-note enter" style={{ marginTop: 'var(--space-3)' }}>
            {notice}{' '}
            {failedClip && (
              <button className="btn btn-secondary" onClick={() => void uploadClip(failedClip)}>
                Try again
              </button>
            )}
          </p>
        )}
      </div>

      {showType && phase !== 'recording' && (
        <div className="type-panel card glass enter" style={{ padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              className="field-input"
              style={{ flex: 1 }}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void sendTyped()}
              placeholder="Type your answer…"
              disabled={phase === 'processing'}
            />
            <button
              className="btn btn-primary"
              onClick={() => void sendTyped()}
              disabled={phase === 'processing' || !typed.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}

      <div className="control-bar glass">
        <span className="ptt-wrap" data-phase={phase}>
          {phase === 'recording' && micMeter && <LevelRing read={micMeter.read} />}
          {phase === 'recording' ? (
            <button className="btn btn-primary ptt ptt-recording" onClick={() => void finishAnswer()}>
              <span className="rec-dot" />
              Done — send my answer
            </button>
          ) : (
            <button
              className={`btn btn-primary ptt ${phase === 'processing' ? 'ptt-processing' : 'ptt-idle'}`}
              onClick={() => void startAnswer()}
              disabled={phase === 'processing'}
            >
              {phase === 'processing' && <span className="ptt-spinner" aria-hidden="true" />}
              {phase === 'processing' ? 'One moment…' : 'Answer'}
            </button>
          )}
        </span>
        <button
          className="btn btn-quiet"
          onClick={() => {
            stopSpeaking();
            void sayPrompt(prompt);
          }}
          disabled={phase === 'recording' || phase === 'processing'}
        >
          Repeat question
        </button>
        <button
          className="btn btn-quiet"
          onClick={() => setShowType((v) => !v)}
          disabled={phase === 'recording'}
        >
          Type instead
        </button>
        {confirmEnd ? (
          <button className="btn btn-danger" onClick={() => void endEarly()}>
            End now — get my report
          </button>
        ) : (
          <button className="btn btn-quiet" onClick={() => setConfirmEnd(true)}>
            End interview
          </button>
        )}
        <button
          className="btn btn-quiet btn-icon"
          data-tip={muted ? 'Unmute UI sounds' : 'Mute UI sounds'}
          aria-label={muted ? 'Unmute UI sounds' : 'Mute UI sounds'}
          onClick={toggleMute}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </main>
  );
}
