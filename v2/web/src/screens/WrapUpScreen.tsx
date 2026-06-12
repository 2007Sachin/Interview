import { useEffect, useRef, useState } from 'react';
import { InterviewerAvatar, type AvatarState } from '../components/InterviewerAvatar';
import { getReport, retryReport, type Report, type SessionView } from '../lib/api';
import { playReportMotif } from '../lib/audio';
import { setMood } from '../lib/mood';
import { getTtsLevel, speak, stopSpeaking } from '../lib/tts';

interface Props {
  session: SessionView;
  closingLine: string;
  onReportReady: (report: Report) => void;
}

/**
 * The report started generating server-side the moment the last answer landed,
 * so most of the time it's ready before the closing line finishes playing.
 * The orb gets a warm send-off, then the whole screen morphs into the report.
 */
export function WrapUpScreen({ session, closingLine, onReportReady }: Props) {
  const [avatarState, setAvatarState] = useState<AvatarState>('speaking');
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const startedRef = useRef(false);
  const handedOffRef = useRef(false);
  const name = session.interviewerName;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setMood('asha');
    const line = `${closingLine} That's a wrap — you showed up and practiced out loud, and that's the hard part. I'm putting your coaching report together right now.`;
    void speak(line).then(() => {
      setAvatarState('thinking');
      setMood('neutral');
    });
    return () => {
      stopSpeaking();
      setMood('neutral');
    };
  }, [closingLine]);

  // Polished morph instead of a hard route change: play the send-off, then
  // hand the report up.
  function handOff(report: Report) {
    if (handedOffRef.current) return;
    handedOffRef.current = true;
    playReportMotif();
    setLeaving(true);
    window.setTimeout(() => onReportReady(report), 650);
  }

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const res = await getReport(session.id);
        if (cancelled) return;
        if (res.status === 'ready') {
          handOff(res.report);
          return;
        }
        if (res.status === 'failed') {
          setFailed(true);
          setAvatarState('idle');
          return;
        }
      } catch {
        // transient — keep polling
      }
      timer = window.setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function tryAgain() {
    setFailed(false);
    setAvatarState('thinking');
    try {
      await retryReport(session.id);
    } catch {
      // poll loop below will surface failure again
    }
    const interval = window.setInterval(async () => {
      const again = await getReport(session.id).catch(() => null);
      if (again?.status === 'ready') {
        window.clearInterval(interval);
        handOff(again.report);
      } else if (again?.status === 'failed') {
        window.clearInterval(interval);
        setFailed(true);
      }
    }, 2000);
  }

  return (
    <main className={`screen screen-center enter-slow ${leaving ? 'wrapup-leave' : ''}`}>
      <div className={leaving ? 'orb-sendoff' : ''}>
        <InterviewerAvatar
          state={avatarState}
          name={name}
          size="lg"
          getLevel={avatarState === 'speaking' ? getTtsLevel : undefined}
          statusLabel={
            failed
              ? `${name} hit a snag`
              : leaving
                ? `See you next round!`
                : avatarState === 'speaking'
                  ? undefined
                  : `${name} is writing your report…`
          }
        />
      </div>
      <h1 style={{ marginTop: 'var(--space-5)' }}>Nicely done.</h1>
      <p className="screen-sub">
        {failed
          ? 'The report hit a snag on our side — your answers are safe. Give it another go.'
          : 'Your coaching report is on its way — it usually takes just a few seconds.'}
      </p>
      {!failed && !leaving && (
        <div className="wrapup-skeleton card" aria-hidden="true">
          <div className="skeleton" style={{ width: '40%' }} />
          <div className="skeleton" style={{ width: '90%' }} />
          <div className="skeleton" style={{ width: '75%' }} />
          <div className="skeleton" style={{ width: '82%' }} />
        </div>
      )}
      {failed && (
        <button className="btn btn-primary" onClick={() => void tryAgain()}>
          Generate my report
        </button>
      )}
    </main>
  );
}
