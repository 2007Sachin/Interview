import { useRef, useState } from 'react';
import {
  answerWithAudio,
  answerWithText,
  createSession,
  type SessionView,
} from './lib/api';
import { startRecording, type ActiveRecording } from './lib/recorder';
import { preloadTts, speak, stopSpeaking } from './lib/tts';

/**
 * Stage 1 test UI: prove the turn loop. Pick a skill, hear/see the question,
 * push-to-talk an answer, see the transcript, get the next prompt.
 * The full student journey replaces this in Stage 2.
 */

type TurnState = 'idle' | 'speaking' | 'recording' | 'processing';

const inputStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-strong)',
  fontSize: 'var(--fs-body)',
  fontFamily: 'inherit',
  background: 'var(--bg-raised)',
  color: 'var(--text-primary)',
};

export default function App() {
  const [session, setSession] = useState<SessionView | null>(null);
  const [skill, setSkill] = useState('');
  const [level, setLevel] = useState('beginner');
  const [creating, setCreating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [turnState, setTurnState] = useState<TurnState>('idle');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [textAnswer, setTextAnswer] = useState('');
  const recordingRef = useRef<ActiveRecording | null>(null);

  async function begin() {
    if (!skill.trim()) return;
    setCreating(true);
    setError('');
    void preloadTts();
    try {
      const s = await createSession({ mode: 'skill', skill, level });
      setSession(s);
      setPrompt(s.currentPrompt);
      setQuestionIndex(s.questionIndex);
      setTotal(s.total);
      setTurnState('speaking');
      await speak(s.currentPrompt);
      setTurnState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the interview.');
    } finally {
      setCreating(false);
    }
  }

  async function startAnswer() {
    setError('');
    stopSpeaking();
    try {
      recordingRef.current = await startRecording(() => void finishAnswer());
      setTurnState('recording');
    } catch {
      setError('Microphone access was blocked — type your answer below instead.');
    }
  }

  async function finishAnswer() {
    const rec = recordingRef.current;
    if (!rec || !session) return;
    recordingRef.current = null;
    setTurnState('processing');
    try {
      const blob = await rec.stop();
      const result = await answerWithAudio(session.id, blob);
      await applyResult(result.transcript, result.nextPrompt, result.questionIndex, result.done, result.retry);
    } catch (err) {
      setTurnState('idle');
      setError(err instanceof Error ? err.message : 'Upload failed — try again.');
    }
  }

  async function sendText() {
    if (!session || !textAnswer.trim()) return;
    setTurnState('processing');
    setError('');
    try {
      const result = await answerWithText(session.id, textAnswer);
      setTextAnswer('');
      await applyResult(result.transcript, result.nextPrompt, result.questionIndex, result.done, result.retry);
    } catch (err) {
      setTurnState('idle');
      setError(err instanceof Error ? err.message : 'Could not send that — try again.');
    }
  }

  async function applyResult(
    heard: string,
    next: string,
    index: number,
    isDone: boolean,
    retry?: boolean,
  ) {
    setTranscript(heard);
    setQuestionIndex(index);
    if (retry) {
      setError("I didn't catch that — try again, or type your answer.");
      setTurnState('idle');
      return;
    }
    setPrompt(next);
    if (isDone) {
      setDone(true);
      setTurnState('speaking');
      await speak(`${next} That's the end of our practice round — well done.`);
      setTurnState('idle');
      return;
    }
    setTurnState('speaking');
    await speak(next);
    setTurnState('idle');
  }

  if (!session) {
    return (
      <main className="enter" style={{ maxWidth: 480, margin: '10vh auto', padding: 'var(--space-5)' }}>
        <p className="label">Stage 1 test bench</p>
        <h1>Practice a skill interview</h1>
        <div className="card" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <input
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="Skill, e.g. SQL"
            style={inputStyle}
          />
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={inputStyle}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={() => void begin()}
            disabled={creating || !skill.trim()}
          >
            {creating ? 'Preparing your interview…' : 'Start practicing'}
          </button>
          {error && <p className="error-note">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="enter" style={{ maxWidth: 640, margin: '8vh auto', padding: 'var(--space-5)' }}>
      <p className="label">
        {done ? 'Interview complete' : `Question ${questionIndex + 1} of ${total}`}
      </p>
      <h1 style={{ fontSize: 'var(--fs-display)' }}>{prompt}</h1>

      {transcript && (
        <div className="card enter" style={{ marginBottom: 'var(--space-4)' }}>
          <p className="label">What I heard</p>
          <p style={{ margin: 0 }}>{transcript}</p>
        </div>
      )}

      {error && (
        <p className="error-note" style={{ marginBottom: 'var(--space-4)' }}>
          {error}
        </p>
      )}

      {!done && (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {turnState === 'recording' ? (
            <button className="btn btn-primary" onClick={() => void finishAnswer()}>
              ● Recording… click Done when finished
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => void startAnswer()}
              disabled={turnState === 'processing' || turnState === 'speaking'}
            >
              {turnState === 'processing' ? 'Listening back…' : 'Answer'}
            </button>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              placeholder="…or type your answer"
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && void sendText()}
            />
            <button
              className="btn btn-secondary"
              onClick={() => void sendText()}
              disabled={turnState === 'processing' || !textAnswer.trim()}
            >
              Send
            </button>
          </div>
          <p className="label" style={{ textTransform: 'none', letterSpacing: 0 }}>
            {turnState === 'speaking' && 'Speaking the question…'}
            {turnState === 'processing' && 'Transcribing your answer…'}
            {turnState === 'idle' && 'Click Answer, speak, then click Done.'}
            {turnState === 'recording' && 'Recording your answer…'}
          </p>
        </div>
      )}

      {done && (
        <div className="card enter">
          <p style={{ margin: 0 }}>
            Turn loop verified — the coaching report arrives in Stage 3. Refresh to run another
            round.
          </p>
        </div>
      )}
    </main>
  );
}
