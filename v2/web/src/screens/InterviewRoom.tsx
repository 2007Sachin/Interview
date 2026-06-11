import { useCallback, useEffect, useRef, useState } from 'react';
import { InterviewerAvatar, type AvatarState } from '../components/InterviewerAvatar';
import {
  answerWithAudio,
  answerWithText,
  endSession,
  type AnswerResponse,
  type SessionView,
} from '../lib/api';
import { startRecording, type ActiveRecording } from '../lib/recorder';
import { speak, stopSpeaking } from '../lib/tts';

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
  const [notice, setNotice] = useState('');
  const [showType, setShowType] = useState(!micWorks);
  const [typed, setTyped] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [failedClip, setFailedClip] = useState<Blob | null>(null);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const startedRef = useRef(false);

  const total = session.total;
  const name = session.interviewerName;

  const sayPrompt = useCallback(async (text: string) => {
    setPhase('speaking');
    await speak(text);
    setPhase('ready');
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Initial phase is already 'speaking' when not resuming; just play the audio.
    if (!resumed) void speak(session.currentPrompt).then(() => setPhase('ready'));
    return () => {
      stopSpeaking();
      recordingRef.current?.cancel();
    };
  }, [resumed, sayPrompt, session.currentPrompt]);

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
    setPrompt(result.nextPrompt);
    void sayPrompt(result.nextPrompt);
  }

  async function startAnswer() {
    setNotice('');
    stopSpeaking();
    try {
      recordingRef.current = await startRecording(() => void finishAnswer());
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
    setPhase('processing');
    try {
      await endSession(session.id);
    } catch {
      // The wrap-up screen will retry report generation if needed.
    }
    onFinished(`Thanks for practicing with me today — ending here is completely fine.`);
  }

  const statusLabel =
    phase === 'processing'
      ? transcript && failedClip === null
        ? `${name} is thinking…`
        : 'Catching every word…'
      : undefined;

  return (
    <main className="room enter">
      <InterviewerAvatar state={phaseToAvatar[phase]} name={name} statusLabel={statusLabel} />

      <div style={{ textAlign: 'center' }}>
        <p className="screen-kicker">
          {isFollowUp ? `Follow-up · Question ${questionIndex + 1} of ${total}` : `Question ${questionIndex + 1} of ${total}`}
        </p>
        <div className="progress-track" aria-hidden="true">
          <div
            className="progress-fill"
            style={{ transform: `scaleX(${(questionIndex + 1) / total})` }}
          />
        </div>
      </div>

      <h1 className="room-question" key={prompt}>
        <span className="enter" style={{ display: 'inline-block' }}>{prompt}</span>
      </h1>

      <div className="transcript-live">
        {transcript && (
          <div className="card enter" style={{ padding: 'var(--space-4)' }}>
            <p className="label">What {name} heard</p>
            <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--text-secondary)' }}>{transcript}</p>
          </div>
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
        <div className="type-panel card enter" style={{ padding: 'var(--space-3)' }}>
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

      <div className="control-bar">
        {phase === 'recording' ? (
          <button className="btn btn-primary" onClick={() => void finishAnswer()}>
            <span className="rec-dot" />
            Done — send my answer
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => void startAnswer()}
            disabled={phase === 'processing'}
          >
            {phase === 'processing' ? 'One moment…' : 'Answer'}
          </button>
        )}
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
      </div>
    </main>
  );
}
