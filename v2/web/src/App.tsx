import { useEffect, useState } from 'react';
import {
  claimSession,
  createDrill,
  createSession,
  createStudent,
  getReport,
  getSession,
  type CreateSessionInput,
  type Report,
  type SessionView,
} from './lib/api';
import { clearStudent, getStudentId, setStudent } from './lib/student';
import { preloadTts } from './lib/tts';
import { StartScreen } from './screens/StartScreen';
import { ReportScreen } from './screens/ReportScreen';
import { BriefingScreen } from './screens/BriefingScreen';
import { MicCheckScreen } from './screens/MicCheckScreen';
import { MeetScreen } from './screens/MeetScreen';
import { InterviewRoom } from './screens/InterviewRoom';
import { WrapUpScreen } from './screens/WrapUpScreen';
import { LostScreen } from './screens/LostScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { Ambient } from './components/Ambient';
import './screens/screens.css';

type Screen =
  | 'restoring'
  | 'lost'
  | 'home'
  | 'progress'
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
  const [screen, setScreen] = useState<Screen>(() => {
    if (sessionStorage.getItem(STORED_ID)) return 'restoring';
    return getStudentId() ? 'home' : 'start';
  });
  const [session, setSession] = useState<SessionView | null>(null);
  const [resumed, setResumed] = useState(false);
  const [micWorks, setMicWorks] = useState(sessionStorage.getItem(STORED_MIC) === '1');
  const [closingLine, setClosingLine] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [creating, setCreating] = useState(false);
  const [startError, setStartError] = useState('');
  const [lastInput, setLastInput] = useState<CreateSessionInput | undefined>(undefined);
  const [signedIn, setSignedIn] = useState(getStudentId() !== null);
  const [progressTopic, setProgressTopic] = useState('');
  const [drillBusy, setDrillBusy] = useState(false);
  const [drillError, setDrillError] = useState('');

  const homeOrStart: Screen = signedIn ? 'home' : 'start';

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
          setScreen('lost');
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

  async function handleDrill() {
    setDrillBusy(true);
    setDrillError('');
    void preloadTts();
    try {
      const s = await createDrill();
      sessionStorage.setItem(STORED_ID, s.id);
      setSession(s);
      setReport(null);
      setResumed(false);
      setLastInput(undefined);
      // Drills skip briefing/mic-check: the student has done this before.
      setScreen('meet');
    } catch (err) {
      setDrillError(err instanceof Error ? err.message : 'Could not build your drill — try again.');
    } finally {
      setDrillBusy(false);
    }
  }

  /** Open a past interview's report from home/progress. */
  async function openPastReport(id: string) {
    try {
      const [s, r] = await Promise.all([getSession(id), getReport(id)]);
      if (r.status !== 'ready') return;
      setSession(s);
      setReport(r.report);
      setLastInput(
        s.mode === 'skill'
          ? { mode: 'skill', skill: s.topicLabel, level: 'intermediate', difficulty: s.difficulty }
          : undefined,
      );
      setScreen('report');
    } catch {
      setScreen('lost');
    }
  }

  /** "Save your progress" on the report: create identity + claim the session. */
  async function handleSaveProgress(handle: string, name: string) {
    const student = await createStudent(handle, name);
    setStudent(student.id, student.name);
    setSignedIn(true);
    if (session) await claimSession(session.id).catch(() => undefined);
  }

  function restartSameTopic() {
    sessionStorage.removeItem(STORED_ID);
    if (lastInput) {
      void handleStart(lastInput);
    } else if (session && session.mode === 'skill' && session.kind === 'interview') {
      void handleStart({
        mode: 'skill',
        skill: session.topicLabel,
        level: 'intermediate',
        difficulty: session.difficulty,
      });
    } else {
      setScreen('start');
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
            <span className="beam" aria-hidden="true" style={{ margin: '0 auto var(--space-4)' }} />
            <p className="screen-sub">Picking up where you left off…</p>
          </main>
        );
      case 'lost':
        return <LostScreen onHome={() => setScreen(homeOrStart)} />;
      case 'home':
        return (
          <HomeScreen
            onNewInterview={() => setScreen('start')}
            onDrill={() => void handleDrill()}
            drillBusy={drillBusy}
            drillError={drillError}
            onOpenReport={(id) => void openPastReport(id)}
            onOpenProgress={(topicKey) => {
              setProgressTopic(topicKey);
              setScreen('progress');
            }}
            onSignedOut={() => {
              clearStudent();
              setSignedIn(false);
              setScreen('start');
            }}
          />
        );
      case 'progress':
        return (
          <ProgressScreen
            topicKey={progressTopic}
            onBack={() => setScreen('home')}
            onOpenReport={(id) => void openPastReport(id)}
            onDrill={() => void handleDrill()}
            drillBusy={drillBusy}
            drillError={drillError}
            onReInterview={(topicLabel) => {
              sessionStorage.removeItem(STORED_ID);
              void handleStart({
                mode: 'skill',
                skill: topicLabel,
                level: 'intermediate',
                difficulty: 'standard',
              });
            }}
          />
        );
      case 'start':
        return (
          <StartScreen
            busy={creating}
            error={startError}
            initial={lastInput}
            onSubmit={(i) => void handleStart(i)}
            onHome={signedIn ? () => setScreen('home') : undefined}
            signedIn={signedIn}
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
            topicLabel={session.topicLabel}
            signedIn={signedIn}
            onRestart={restartSameTopic}
            onSaveProgress={handleSaveProgress}
            onTrySuggested={(topic) => {
              sessionStorage.removeItem(STORED_ID);
              setLastInput({ mode: 'skill', skill: topic, level: 'beginner', difficulty: 'standard' });
              setScreen('start');
            }}
            onHome={() => {
              sessionStorage.removeItem(STORED_ID);
              setScreen('home');
            }}
          />
        ) : null;
    }
  }
}
