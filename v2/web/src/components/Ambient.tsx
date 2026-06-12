import './ambient.css';

/**
 * Ambient depth behind every screen: slow-drifting gradient blobs (25-30s
 * loops), mood-tinted overlays cross-faded via opacity, and a faint vignette
 * that keeps focus center-stage. Pure CSS, fixed-position, pointer-inert.
 */
export function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="amb-stars" />
      <span className="amb-blob amb-base-a" />
      <span className="amb-blob amb-base-b" />
      <span className="amb-blob amb-mood amb-warm" />
      <span className="amb-blob amb-mood amb-indigo" />
      <div className="amb-vignette" />
    </div>
  );
}
