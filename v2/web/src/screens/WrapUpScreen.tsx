import { useEffect, useRef, useState } from 'react';
import { InterviewerAvatar, type AvatarState } from '../components/InterviewerAvatar';
import { getReport, retryReport, type Report, type SessionView } from '../lib/api';
import { speak, stopSpeaking } from '../lib/tts';

interface Props {
  session: SessionView;
  closingLine: string;
  onReportReady: (report: Report) => void;
}

/**
 * The report started generating server-side the moment the last answer landed,
 * so most of the time it's ready before the closing line finishes playing.
 */
export function WrapUpScreen({ session, closingLine, onReportReady }: Props) {
  const [avatarState, setAvatarState] = useState<AvatarState>('speaking');
  const [failed, setFailed] = useState(false);
  const startedRef = useRef(false);
  const name = session.interviewerName;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const line = `${closingLine} That's a wrap — you showed up and practiced out loud, and that's the hard part. I'm putting your coaching report together right now.`;
    void speak(line).then(() => setAvatarState('thinking'));
    return () => stopSpeaking();
  }, [closingLine]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const res = await getReport(session.id);
        if (cancelled) return;
        if (res.status === 'ready') {
          onReportReady(res.report);
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
  }, [session.id, onReportReady]);

  async function tryAgain() {
    setFailed(false);
    setAvatarState('thinking');
    try {
      await retryReport(session.id);
    } catch {
      // poll loop below will surface failure again
    }
    const res = await getReport(session.id);
    if (res.status === 'ready') onReportReady(res.report);
    else if (res.status === 'failed') setFailed(true);
    else {
      // back to polling
      const interval = window.setInterval(async () => {
        const again = await getReport(session.id).catch(() => null);
        if (again?.status === 'ready') {
          window.clearInterval(interval);
          onReportReady(again.report);
        } else if (again?.status === 'failed') {
          window.clearInterval(interval);
          setFailed(true);
        }
      }, 2000);
    }
  }

  return (
    <main className="screen screen-center enter-slow">
      <InterviewerAvatar
        state={avatarState}
        name={name}
        size="lg"
        statusLabel={
          failed
            ? `${name} hit a snag`
            : avatarState === 'speaking'
              ? undefined
              : `${name} is writing your report…`
        }
      />
      <h1 style={{ marginTop: 'var(--space-5)' }}>Nicely done.</h1>
      <p className="screen-sub">
        {failed
          ? 'The report hit a snag on our side — your answers are safe. Give it another go.'
          : 'Your coaching report is on its way — it usually takes just a few seconds.'}
      </p>
      {failed && (
        <button className="btn btn-primary" onClick={() => void tryAgain()}>
          Generate my report
        </button>
      )}
    </main>
  );
}
