interface Props {
  onHome: () => void;
}

/**
 * Designed error / not-found state: shown when a stored session can't be
 * recovered (expired, deleted, or the server is unreachable).
 */
export function LostScreen({ onHome }: Props) {
  return (
    <main className="screen lost-screen enter">
      <span className="ghost-num" aria-hidden="true">
        404
      </span>
      <h1>This session drifted off into the dark.</h1>
      <span className="beam" aria-hidden="true" />
      <p className="screen-sub">
        We couldn't find that interview — it may have expired, or the connection slipped.
        Nothing you did wrong. The light's still on: start a fresh round whenever you're
        ready.
      </p>
      <button className="btn btn-primary" style={{ marginTop: 'var(--space-5)' }} onClick={onHome}>
        Start a new interview
      </button>
    </main>
  );
}
