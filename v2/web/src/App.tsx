import { useEffect, useState } from 'react';
import {
  createSession,
  getReport,
  getSession,
  type CreateSessionInput,
  type Report,
  type SessionView,
} from './lib/api';
import { preloadTts } from './lib/tts';
import { StartScreen } from './screens/StartScreen';
import { ReportScreen } from './screens/ReportScreen';
import { BriefingScreen } from './screens/BriefingScreen';
import { MicCheckScreen } from './screens/MicCheckScreen';
import { MeetScreen } from './screens/MeetScreen';
import { InterviewRoom } from './screens/InterviewRoom';
import { WrapUpScreen } from './screens/WrapUpScreen';
import { Ambient } from './components/Ambient';
import './screens/screens.css';

type Screen =
  | 'restoring'
  | 'start'
  | 'briefing'
  | 'miccheck'
  | 'meet'
  | 'interview'
  | 'wrapup'
  | 'report';

const STORED_ID = 'interview.sessionId';
const STORED_MIC = 'interview.micWorks';

export default function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    sessionStorage.getItem(STORED_ID) ? 'restoring' : 'start',
  );
  const [session, setSession] = useState<SessionView | null>(null);
  const [resumed, setResumed] = useState(false);
  const [micWorks, setMicWorks] = useState(sessionStorage.getItem(STORED_MIC) === '1');
  const [closingLine, setClosingLine] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [creating, setCreating] = useState(false);
  const [startError, setStartError] = useState('');
  const [lastInput, setLastInput] = useState<CreateSessionInput | undefined>(undefined);

  // Refresh mid-interview: the server is the source of truth, so we just
  // re-fetch the session and drop the student back at the current question
  // (or their report, if the interview already ended).
  useEffect(() => {
    const id = sessionStorage.getItem(STORED_ID);
    if (!id || screen !== 'restoring') return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await getSession(id);
        if (cancelled) return;
        setSession(s);
        if (s.status === 'active') {
          setResumed(true);
          setScreen('interview');
        } else {
          const r = await getReport(id);
          if (cancelled) return;
          if (r.status === 'ready') {
            setReport(r.report);
            setScreen('report');
          } else {
            setClosingLine('Welcome back!');
            setScreen('wrapup');
          }
        }
      } catch {
        if (!cancelled) {
          sessionStorage.removeItem(STORED_ID);
          setScreen('start');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen]);

  async function handleStart(input: CreateSessionInput) {
    setCreating(true);
    setStartError('');
    setLastInput(input);
    void preloadTts();
    try {
      const s = await createSession(input);
      sessionStorage.setItem(STORED_ID, s.id);
      setSession(s);
      setReport(null);
      setResumed(false);
      setScreen('briefing');
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : 'Could not set up the interview — try again.',
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Ambient />
      {renderScreen()}
    </>
  );

  function renderScreen() {
    switch (screen) {
      case 'restoring':
      return (
        <main className="screen screen-center enter">
          <p className="screen-sub">Picking up where you left off…</p>
        </main>
      );
    case 'start':
      return (
        <StartScreen
          busy={creating}
          error={startError}
          initial={lastInput}
          onSubmit={(i) => void handleStart(i)}
        />
      );
    case 'briefing':
      return session ? (
        <BriefingScreen session={session} onContinue={() => setScreen('miccheck')} />
      ) : null;
    case 'miccheck':
      return session ? (
        <MicCheckScreen
          interviewerName={session.interviewerName}
          onContinue={(ok) => {
            setMicWorks(ok);
            sessionStorage.setItem(STORED_MIC, ok ? '1' : '0');
            setScreen('meet');
          }}
        />
      ) : null;
    case 'meet':
      return session ? <MeetScreen session={session} onStart={() => setScreen('interview')} /> : null;
    case 'interview':
      return session ? (
        <InterviewRoom
          session={session}
          micWorks={micWorks}
          resumed={resumed}
          onFinished={(line) => {
            setClosingLine(line);
            setScreen('wrapup');
          }}
        />
      ) : null;
    case 'wrapup':
      return session ? (
        <WrapUpScreen
          session={session}
          closingLine={closingLine}
          onReportReady={(r) => {
            setReport(r);
            setScreen('report');
          }}
        />
      ) : null;
    case 'report':
      return report && session ? (
        <ReportScreen
          report={report}
          interviewerName={session.interviewerName}
          onRestart={() => {
            sessionStorage.removeItem(STORED_ID);
            setScreen('start');
          }}
        />
      ) : null;
    }
  }
}
