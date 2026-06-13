import { useEffect, useMemo, useState } from 'react';
import './questionText.css';

interface Props {
  text: string;
  /**
   * Duration of the TTS clip speaking this text (seconds), or null while the
   * voice is still being generated. Words reveal staggered across ~85% of the
   * clip so the text lands in sync with the voice; if no duration arrives
   * within a short grace period (TTS slow/unavailable), a quick fallback
   * reveal runs so the question is never held hostage.
   */
  speechSeconds: number | null;
}

/**
 * Large display question with word-by-word reveal timed to speech. Key this
 * component by the question text so each new question restarts the reveal.
 */
export function QuestionText({ text, speechSeconds }: Props) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (speechSeconds !== null) return;
    // Short grace so the question shows up even when TTS is slow or unavailable.
    // The parent keys this component by prompt text, so `timedOut` resets per question.
    const t = window.setTimeout(() => setTimedOut(true), 700);
    return () => window.clearTimeout(t);
  }, [speechSeconds]);

  const ready = speechSeconds !== null || timedOut;
  const windowSec = speechSeconds && speechSeconds > 0.5 ? speechSeconds * 0.85 : 1.4;
  const perWord = words.length > 1 ? windowSec / words.length : 0;

  return (
    <h1 className="room-question question-reveal">
      {words.map((word, i) => (
        <span
          key={`${i}-${word}`}
          className={`q-word ${ready ? '' : 'q-pending'}`}
          style={ready ? { animationDelay: `${(i * perWord).toFixed(3)}s` } : undefined}
        >
          {word}{' '}
        </span>
      ))}
    </h1>
  );
}
