import { useState } from 'react';
import {
  createSession,
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
import './screens/screens.css';

type Screen = 'start' | 'briefing' | 'miccheck' | 'meet' | 'interview' | 'wrapup' | 'report';

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [session, setSession] = useState<SessionView | null>(null);
  const [micWorks, setMicWorks] = useState(false);
  const [closingLine, setClosingLine] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [creating, setCreating] = useState(false);
  const [startError, setStartError] = useState('');
  const [lastInput, setLastInput] = useState<CreateSessionInput | undefined>(undefined);

  async function handleStart(input: CreateSessionInput) {
    setCreating(true);
    setStartError('');
    setLastInput(input);
    void preloadTts();
    try {
      const s = await createSession(input);
      setSession(s);
      setReport(null);
      setScreen('briefing');
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : 'Could not set up the interview — try again.',
      );
    } finally {
      setCreating(false);
    }
  }

  switch (screen) {
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
          onRestart={() => setScreen('start')}
        />
      ) : null;
  }
}
