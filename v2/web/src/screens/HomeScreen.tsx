import { useEffect, useState } from 'react';
import {
  deleteAccount,
  deleteInterview,
  getMe,
  listInterviews,
  type InterviewSummary,
  type Student,
} from '../lib/api';
import { getStudentName } from '../lib/student';

interface Props {
  onNewInterview: () => void;
  onDrill: () => void;
  drillBusy: boolean;
  drillError: string;
  onOpenReport: (id: string) => void;
  onOpenProgress: (topicKey: string) => void;
  onSignedOut: () => void;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function readinessColor(level: string | null): string {
  if (level === 'interview-ready') return 'var(--aurora-teal)';
  if (level === 'needs practice') return 'var(--aurora-violet)';
  return 'var(--text-secondary)';
}

export function HomeScreen({
  onNewInterview,
  onDrill,
  drillBusy,
  drillError,
  onOpenReport,
  onOpenProgress,
  onSignedOut,
}: Props) {
  const [me, setMe] = useState<Student | null>(null);
  const [interviews, setInterviews] = useState<InterviewSummary[] | null>(null);
  const [error, setError] = useState('');
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [profile, list] = await Promise.all([getMe(), listInterviews()]);
        if (cancelled) return;
        setMe(profile);
        setInterviews(list);
      } catch {
        if (!cancelled) setError('Could not load your interviews — check the connection and refresh.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function removeInterview(id: string) {
    try {
      await deleteInterview(id);
      setInterviews((list) => list?.filter((s) => s.id !== id) ?? null);
    } catch {
      setError('Could not delete that one — try again.');
    }
  }

  async function removeAccount() {
    try {
      await deleteAccount();
      onSignedOut();
    } catch {
      setError('Could not delete your data just now — try again.');
    }
  }

  const name = me?.name || getStudentName();
  const week = me?.interviewsThisWeek ?? 0;
  const done = interviews?.filter((s) => s.score !== null) ?? [];
  const seenTopics = new Set<string>();

  return (
    <main className="screen enter">
      <p className="screen-kicker">My interviews</p>
      <h1>{name ? `Welcome back, ${name}.` : 'Welcome back.'}</h1>
      <span className="beam" aria-hidden="true" />
      <p className="screen-sub">
        {week >= 3
          ? `${week} interviews this week — that's real momentum. Keep the streak alive.`
          : week > 0
            ? `${week} interview${week === 1 ? '' : 's'} this week. One more rep moves the needle.`
            : 'The best time for a rep is now. Pick up where you left off.'}
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', margin: 'var(--space-4) 0 var(--space-6)' }}>
        <button className="btn btn-primary" onClick={onNewInterview}>
          New interview
        </button>
        <button
          className="btn btn-secondary"
          onClick={onDrill}
          disabled={drillBusy || done.length === 0}
          data-tip={done.length === 0 ? 'Finish one interview first' : 'A 3-question round built from your weak spots'}
        >
          {drillBusy ? 'Building your drill…' : 'Weak spot drill'}
        </button>
      </div>
      {drillError && <p className="error-note" style={{ marginBottom: 'var(--space-4)' }}>{drillError}</p>}
      {error && <p className="error-note" style={{ marginBottom: 'var(--space-4)' }}>{error}</p>}

      {interviews === null && !error && (
        <div style={{ display: 'grid', gap: 'var(--space-2)', width: 'min(640px, 100%)' }}>
          <div className="skeleton" style={{ width: '70%' }} />
          <div className="skeleton" style={{ width: '85%' }} />
          <div className="skeleton" style={{ width: '60%' }} />
        </div>
      )}

      {interviews !== null && interviews.length === 0 && (
        <div className="card beam-top" style={{ width: 'min(560px, 100%)' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            No interviews saved yet. Run one and it'll land here — with your score trend right
            behind it.
          </p>
        </div>
      )}

      <div style={{ width: 'min(720px, 100%)', display: 'grid' }}>
        {interviews?.map((s) => {
          const showProgress = s.kind === 'interview' && !seenTopics.has(s.topicKey);
          if (showProgress) seenTopics.add(s.topicKey);
          return (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
                borderTop: '1px solid var(--border)',
                padding: 'var(--space-4) 0',
              }}
            >
              <span className="label" style={{ minWidth: 56 }}>
                {DATE_FMT.format(new Date(s.createdAt))}
              </span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-subtitle)', fontWeight: 500 }}>
                  {s.kind === 'drill' ? '⚡ ' : ''}
                  {s.topicLabel}
                </b>
                <div style={{ fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>
                  {s.difficulty}
                  {s.readinessLevel && (
                    <>
                      {' · '}
                      <span style={{ color: readinessColor(s.readinessLevel) }}>{s.readinessLevel}</span>
                    </>
                  )}
                  {s.score !== null && ` · ${Math.round(s.score)} / 100`}
                  {s.score === null && ' · unfinished'}
                </div>
              </div>
              <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {s.score !== null && (
                  <button className="btn btn-quiet" onClick={() => onOpenReport(s.id)}>
                    Report
                  </button>
                )}
                {showProgress && (
                  <button className="btn btn-quiet" onClick={() => onOpenProgress(s.topicKey)}>
                    Progress
                  </button>
                )}
                <button
                  className="btn btn-quiet"
                  aria-label={`Delete interview on ${s.topicLabel}`}
                  data-tip="Delete this interview"
                  onClick={() => void removeInterview(s.id)}
                >
                  ✕
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 'var(--space-7)' }}>
        {confirmDeleteAll ? (
          <button className="btn btn-danger" onClick={() => void removeAccount()}>
            Yes — delete my account and every interview
          </button>
        ) : (
          <button className="btn btn-quiet" onClick={() => setConfirmDeleteAll(true)}>
            Delete my data
          </button>
        )}
      </div>
    </main>
  );
}
