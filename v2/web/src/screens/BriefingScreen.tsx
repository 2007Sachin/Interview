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
      <p className="screen-sub">{brief.summary}</p>

      <div className="fact-grid">
        <div className="fact">
          <b>~7 min</b>
          <span>Interview length</span>
        </div>
        <div className="fact">
          <b>{total} questions</b>
          <span>Plus the odd follow-up</span>
        </div>
        <div className="fact">
          <b>Coaching report</b>
          <span>What you'll get at the end</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <p className="label">How it works</p>
        <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-secondary)' }}>
          {interviewerName} asks one question at a time. Speak naturally — you control when to
          move on, you can ask to hear a question again, type instead of speaking, or end early
          at any point. There's no failing here: every answer is practice, and you'll leave with
          a coaching report that shows what you did well and the one thing to fix next.
        </p>
        {brief.focusAreas.length > 0 && (
          <>
            <p className="label" style={{ marginTop: 'var(--space-4)' }}>
              We'll focus on
            </p>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-secondary)' }}>
              {brief.focusAreas.join(' · ')}
            </p>
          </>
        )}
      </div>

      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={onContinue}>
        Continue
      </button>
    </main>
  );
}
