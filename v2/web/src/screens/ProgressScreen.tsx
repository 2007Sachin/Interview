import { useEffect, useState } from 'react';
import { Sparkline } from '../components/Sparkline';
import { getProgress, type TopicProgress } from '../lib/api';

interface Props {
  topicKey: string;
  onBack: () => void;
  onOpenReport: (id: string) => void;
  onReInterview: (topicLabel: string) => void;
  onDrill?: () => void;
  drillBusy?: boolean;
  drillError?: string;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function ProgressScreen({ topicKey, onBack, onOpenReport, onReInterview, onDrill, drillBusy, drillError }: Props) {
  const [progress, setProgress] = useState<TopicProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getProgress(topicKey)
      .then((p) => !cancelled && setProgress(p))
      .catch(() => !cancelled && setError('Could not load progress — refresh to try again.'));
    return () => {
      cancelled = true;
    };
  }, [topicKey]);

  const attempts = progress?.attempts ?? [];
  const latest = attempts.at(-1);
  const previous = attempts.at(-2);
  const delta = latest && previous ? Math.round(latest.score - previous.score) : null;

  return (
    <main className="screen enter">
      <button className="btn btn-quiet" style={{ alignSelf: 'flex-start', marginBottom: 'var(--space-4)' }} onClick={onBack}>
        ← My interviews
      </button>
      <p className="screen-kicker">Progress</p>
      <h1>{progress?.topicLabel ?? '…'}</h1>
      <span className="beam" aria-hidden="true" />

      {error && <p className="error-note">{error}</p>}
      {!progress && !error && (
        <div style={{ display: 'grid', gap: 'var(--space-2)', width: 'min(480px, 100%)' }}>
          <div className="skeleton" style={{ width: '60%' }} />
          <div className="skeleton" style={{ width: '90%' }} />
        </div>
      )}

      {progress && attempts.length === 0 && (
        <p className="screen-sub">No finished attempts on this topic yet — your trend starts with the next one.</p>
      )}

      {latest && progress && (
        <div className="brief-grid">
          <div>
            <p className="label">Score trend · {attempts.length} attempt{attempts.length === 1 ? '' : 's'}</p>
            <Sparkline values={attempts.map((a) => a.score)} />
            <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
              {delta === null
                ? 'One attempt in — run it again and the trend line appears.'
                : delta > 0
                  ? `Up ${delta} points since last time. That's the work showing.`
                  : delta === 0
                    ? 'Holding steady — consistency is its own win. Push one weak spot next round.'
                    : `Down ${-delta} points — totally normal between reps. The trend matters more than any single round.`}
            </p>

            {/* What changed: the report-vs-report comparison */}
            <div className="card beam-top" style={{ marginTop: 'var(--space-5)' }}>
              <p className="label">What changed</p>
              {latest.progressNote ? (
                <p style={{ margin: 'var(--space-2) 0 0' }}>{latest.progressNote}</p>
              ) : previous ? (
                <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-secondary)' }}>
                  Last time's focus: “{previous.oneThingToFix}”. This time's: “{latest.oneThingToFix}”.
                  {previous.oneThingToFix.toLowerCase() === latest.oneThingToFix.toLowerCase()
                    ? ' Same spot — make it the whole point of your next rep.'
                    : ' A new focus means the old one stopped being the problem. Progress.'}
                </p>
              ) : (
                <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-secondary)' }}>
                  Your first focus: “{latest.oneThingToFix}”. Fix it, re-interview, and this card
                  will tell you whether it stuck.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-5)' }}>
              <button
                className="btn btn-primary"
                onClick={() => onReInterview(progress.topicLabel)}
              >
                Re-interview on {progress.topicLabel}
              </button>
              {onDrill && (
                <button
                  className="btn btn-secondary"
                  onClick={onDrill}
                  disabled={drillBusy}
                  data-tip="A 3-question round built from your weak spots across topics"
                >
                  {drillBusy ? 'Building your drill…' : 'Weak spot drill'}
                </button>
              )}
            </div>
            {drillError && <p className="error-note" style={{ marginTop: 'var(--space-3)' }}>{drillError}</p>}
          </div>

          <aside className="brief-rail" aria-label="Attempts">
            <p className="label">Readiness journey</p>
            {attempts.map((a, i) => (
              <div key={a.id} className="fact">
                <b style={{ fontSize: 'var(--fs-subtitle)' }}>
                  {Math.round(a.score)} / 100
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {a.readinessLevel}</span>
                </b>
                <span>
                  #{i + 1} · {DATE_FMT.format(new Date(a.createdAt))} · {a.difficulty} ·{' '}
                  <button
                    className="btn btn-quiet"
                    style={{ padding: 0, fontSize: 'inherit' }}
                    onClick={() => onOpenReport(a.id)}
                  >
                    report
                  </button>
                </span>
              </div>
            ))}
          </aside>
        </div>
      )}
    </main>
  );
}
