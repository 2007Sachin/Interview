import './InterviewerAvatar.css';

export type AvatarState = 'idle' | 'speaking' | 'listening' | 'thinking';

const DEFAULT_LABELS: Record<AvatarState, (name: string) => string> = {
  idle: (name) => `${name} is ready`,
  speaking: (name) => `${name} is speaking…`,
  listening: (name) => `${name} is listening…`,
  thinking: (name) => `${name} is thinking…`,
};

interface Props {
  state: AvatarState;
  name: string;
  /** Override the status line; falls back to a sensible default per state. */
  statusLabel?: string;
  size?: 'md' | 'lg';
}

/**
 * The interviewer: an abstract animated orb. Pure CSS — no canvas, no
 * external services, no human face. A constant ambient "breathing" layer sits
 * under a per-state layer (waveform pulse / ripple / orbital shimmer); state
 * layers cross-fade over var(--dur-state) so transitions feel organic.
 */
export function InterviewerAvatar({ state, name, statusLabel, size = 'md' }: Props) {
  return (
    <div className={`avatar avatar-${size}`} data-state={state}>
      <div className="avatar-stage" aria-hidden="true">
        {/* ambient breathing core */}
        <div className="avatar-orb">
          <div className="avatar-core" />
          <div className="avatar-blob avatar-blob-a" />
          <div className="avatar-blob avatar-blob-b" />
        </div>
        {/* SPEAKING: organic waveform pulse */}
        <div className="avatar-layer avatar-speaking">
          <span className="wave wave-1" />
          <span className="wave wave-2" />
          <span className="wave wave-3" />
        </div>
        {/* LISTENING: calm slow ripples */}
        <div className="avatar-layer avatar-listening">
          <span className="ripple ripple-1" />
          <span className="ripple ripple-2" />
        </div>
        {/* THINKING: subtle orbital shimmer */}
        <div className="avatar-layer avatar-thinking">
          <span className="orbit orbit-1"><i /></span>
          <span className="orbit orbit-2"><i /></span>
        </div>
      </div>
      <p className="avatar-name">{name}</p>
      <p className="avatar-status" role="status">
        {statusLabel ?? DEFAULT_LABELS[state](name)}
      </p>
    </div>
  );
}
