import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/audio';

interface Props {
  /** Live 0..1 amplitude reader, sampled every animation frame. */
  read: () => number;
}

/**
 * Real-time amplitude ring around the push-to-talk button: the student SEES
 * themselves being heard. Transform/opacity only, one rAF loop, 60fps.
 */
export function LevelRing({ read }: Props) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    let raf = 0;
    const tick = () => {
      const level = read();
      outer.style.transform = `scale(${1 + level * 0.55})`;
      outer.style.opacity = String(0.25 + level * 0.6);
      inner.style.transform = `scale(${1 + level * 0.25})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [read]);

  return (
    <>
      <span ref={outerRef} className="level-ring level-ring-outer" aria-hidden="true" />
      <span ref={innerRef} className="level-ring level-ring-inner" aria-hidden="true" />
    </>
  );
}
