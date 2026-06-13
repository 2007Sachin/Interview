import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/audio';
import './voiceWave.css';

interface Props {
  /** Live 0..1 amplitude reader, sampled every animation frame. */
  read: () => number;
  /** Visual tone — 'asha' (warm) while TTS speaks, 'student' (cool) while mic records. */
  tone?: 'asha' | 'student';
  bars?: number;
}

/**
 * A simple voice-amplitude wave: N vertical bars that bounce with real audio
 * level. CSS transform only, one rAF loop, no canvas. Each bar reads the level
 * with its own phase offset so the wave feels alive even at steady volume.
 */
export function VoiceWave({ read, tone = 'asha', bars = 9 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const reduced = prefersReducedMotion();
    const nodes = Array.from(wrap.children) as HTMLElement[];
    if (reduced) {
      nodes.forEach((n) => (n.style.transform = 'scaleY(0.4)'));
      return;
    }
    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 1;
      const base = Math.max(0, Math.min(1, read()));
      for (let i = 0; i < nodes.length; i++) {
        // Phase per bar so the wave undulates instead of pumping in unison.
        const phase = Math.sin(t * 0.18 + i * 0.7) * 0.25 + 0.75;
        const scale = 0.18 + base * phase * 1.1;
        nodes[i].style.transform = `scaleY(${scale.toFixed(3)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [read]);

  return (
    <div className={`voice-wave voice-wave-${tone}`} aria-hidden="true" ref={wrapRef}>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="voice-wave-bar" />
      ))}
    </div>
  );
}
