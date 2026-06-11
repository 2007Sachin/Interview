import { useEffect, useRef, useState } from 'react';
import { InterviewerAvatar, type AvatarState } from '../components/InterviewerAvatar';
import type { SessionView } from '../lib/api';
import { speak, stopSpeaking } from '../lib/tts';

interface Props {
  session: SessionView;
  onStart: () => void;
}

export function MeetScreen({ session, onStart }: Props) {
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const spokeRef = useRef(false);
  const name = session.interviewerName;

  useEffect(() => {
    if (spokeRef.current) return;
    spokeRef.current = true;
    const intro = `Hi, I'm ${name} — I'll be interviewing you on ${session.brief.title}. Ready when you are.`;
    setAvatarState('speaking');
    void speak(intro).then(() => setAvatarState('idle'));
    return () => stopSpeaking();
  }, [name, session.brief.title]);

  return (
    <main className="screen screen-center enter-slow">
      <InterviewerAvatar state={avatarState} name={name} size="lg" />
      <h1 style={{ marginTop: 'var(--space-5)' }}>Meet {name}</h1>
      <p className="screen-sub">
        "Hi, I'm {name} — I'll be interviewing you on {session.brief.title}. Ready when you are."
      </p>
      <button
        className="btn btn-primary"
        style={{ marginTop: 'var(--space-4)' }}
        onClick={() => {
          stopSpeaking();
          onStart();
        }}
      >
        Start the interview
      </button>
    </main>
  );
}
