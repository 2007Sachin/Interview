import type { SessionView } from '../lib/api';

interface Props {
  session: SessionView;
  onContinue: () => void;
}

export function BriefingScreen({ session, onContinue }: Props) {
  const { brief, total, interviewerName } = session;
  return (
    <main className="screen enter">
      <p className="screen-kicker">Your interview brief</p>
      <h1>{brief.title}</h1>
      <span className="beam" aria-hidden="true" />

      <div className="brief-grid">
        <div>
          <p className="screen-sub">{brief.summary}</p>
          <h2 className="screen-title" style={{ marginTop: 'var(--space-6)' }}>
            How it works
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '54ch' }}>
            {interviewerName} asks one question at a time. Speak naturally — you control when
            to move on, you can ask to hear a question again, type instead of speaking, or end
            early at any point. There's no failing here: every answer is practice, and you'll
            leave with a coaching report that shows what you did well and the one thing to fix
            next.
          </p>
          {brief.focusAreas.length > 0 && (
            <>
              <p className="label" style={{ marginTop: 'var(--space-5)' }}>
                We'll focus on
              </p>
              <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-secondary)' }}>
                {brief.focusAreas.join(' · ')}
              </p>
            </>
          )}
          <button
            className="btn btn-primary"
            style={{ marginTop: 'var(--space-6)' }}
            onClick={onContinue}
          >
            Continue
          </button>
        </div>

        <aside className="brief-rail" aria-label="Interview facts">
          <span className="ghost-num" aria-hidden="true">
            {String(total).padStart(2, '0')}
          </span>
          <div className="fact">
            <b>{total} questions</b>
            <span>Plus the odd follow-up</span>
          </div>
          <div className="fact">
            <b>~7 min</b>
            <span>Interview length</span>
          </div>
          <div className="fact">
            <b>Coaching report</b>
            <span>What you'll get at the end</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
