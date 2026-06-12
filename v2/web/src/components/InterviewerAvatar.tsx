import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/audio';
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
  /**
   * Live 0..1 audio level (TTS output while speaking, mic input while
   * listening). Sampled per animation frame; the orb swells with real sound.
   */
  getLevel?: () => number;
}

/**
 * The interviewer: an abstract animated orb. Pure CSS + one rAF loop — no
 * canvas libraries, no external services, no human face. A constant ambient
 * "breathing" layer sits under a per-state layer (waveform pulse / ripple /
 * orbital shimmer); state layers cross-fade over var(--dur-state). When a
 * level reader is supplied, the orb scales with the actual audio amplitude.
 */
export function InterviewerAvatar({ state, name, statusLabel, size = 'md', getLevel }: Props) {
  const reactRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = reactRef.current;
    const glow = glowRef.current;
    if (!node || !glow) return;
    if (!getLevel || prefersReducedMotion()) {
      node.style.transform = '';
      glow.style.opacity = '0';
      return;
    }
    let raf = 0;
    const tick = () => {
      const level = getLevel();
      // Transform/opacity only — no layout work in the hot path.
      node.style.transform = `scale(${1 + level * 0.16})`;
      glow.style.opacity = String(Math.min(0.85, level * 1.4));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      node.style.transform = '';
      glow.style.opacity = '0';
    };
  }, [getLevel]);

  const label = statusLabel ?? DEFAULT_LABELS[state](name);

  return (
    <div className={`avatar avatar-${size}`} data-state={state}>
      <div className="avatar-stage" aria-hidden="true">
        <div className="avatar-glow" ref={glowRef} />
        {/* audio-reactive wrapper: scaled per-frame from the real amplitude */}
        <div className="avatar-react" ref={reactRef}>
          {/* ambient breathing core */}
          <div className="avatar-orb">
            <div className="avatar-core" />
            <div className="avatar-blob avatar-blob-a" />
            <div className="avatar-blob avatar-blob-b" />
          </div>
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
        {/* keyed span so text changes cross-fade instead of snapping */}
        <span key={label} className="avatar-status-text">
          {label}
        </span>
      </p>
    </div>
  );
}
