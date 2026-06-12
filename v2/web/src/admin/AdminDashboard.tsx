import { useEffect, useState } from 'react';
import type { ReadinessLevel } from '../lib/api';
import { fetchOverview, type AdminOverview } from './adminApi';

const LEVELS: { level: ReadinessLevel; color: string }[] = [
  { level: 'needs practice', color: 'var(--aurora-violet)' },
  { level: 'developing', color: 'var(--text-muted)' },
  { level: 'interview-ready', color: 'var(--aurora-teal)' },
];

function delta(now: number | null, before: number | null): string {
  if (now === null || before === null || before === 0) return '';
  const diff = Math.round((now - before) * 10) / 10;
  return diff > 0 ? `▲ ${diff} vs last week` : diff < 0 ? `▼ ${Math.abs(diff)} vs last week` : '— level with last week';
}

export function AdminDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchOverview()
      .then((d) => !cancelled && setData(d))
      .catch((err: Error) => {
        if (cancelled) return;
        if (err.message === 'unauthorized') onUnauthorized();
        else setError('Could not load the dashboard — refresh to retry.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="error-note">{error}</p>;
  if (!data) {
    return (
      <div style={{ display: 'grid', gap: 'var(--space-3)', width: '100%' }}>
        <div className="skeleton" style={{ width: '60%' }} />
        <div className="skeleton" style={{ width: '90%' }} />
        <div className="skeleton" style={{ width: '75%' }} />
      </div>
    );
  }

  const readinessTotal = LEVELS.reduce((sum, l) => sum + data.readinessNow[l.level], 0) || 1;
  const maxDay = Math.max(1, ...data.perDay.map((d) => d.count));
  const maxTopic = Math.max(1, ...data.hotTopics.map((t) => t.attempts));

  return (
    <div className="admin-grid">
      <h1>Are they practicing — and getting ready?</h1>
      <span className="beam" aria-hidden="true" />

      {/* Top row stat cards */}
      <div className="stat-row">
        <div className="card beam-top stat-card">
          <span className="stat-num">{data.activeStudentsThisWeek}</span>
          <span className="label">Active students this week</span>
          <span className="stat-sub">of {data.totalStudents} signed up</span>
        </div>
        <div className="card beam-top stat-card">
          <span className="stat-num">{data.interviewsThisWeek}</span>
          <span className="label">Interviews this week</span>
          <span className="stat-sub">{delta(data.interviewsThisWeek, data.interviewsPrevWeek)}</span>
        </div>
        <div className="card beam-top stat-card">
          <span className="stat-num">{data.avgScoreThisWeek ?? '—'}</span>
          <span className="label">Avg score this week</span>
          <span className="stat-sub">{delta(data.avgScoreThisWeek, data.avgScorePrevWeek)}</span>
        </div>
        <div className="card beam-top stat-card">
          <span className="label" style={{ marginBottom: 'var(--space-2)' }}>
            Readiness mix
          </span>
          <div className="stacked-bar" role="img" aria-label={LEVELS.map((l) => `${l.level}: ${data.readinessNow[l.level]}`).join(', ')}>
            {LEVELS.map((l) =>
              data.readinessNow[l.level] > 0 ? (
                <span
                  key={l.level}
                  style={{
                    width: `${(data.readinessNow[l.level] / readinessTotal) * 100}%`,
                    background: l.color,
                  }}
                />
              ) : null,
            )}
          </div>
          <span className="stat-sub" style={{ marginTop: 'var(--space-2)' }}>
            {LEVELS.map((l) => `${data.readinessNow[l.level]} ${l.level}`).join(' · ')}
          </span>
        </div>
      </div>

      {/* Usage over time */}
      <section className="card">
        <p className="label">Interviews per day · last 30 days</p>
        <div className="day-bars" aria-hidden="true">
          {data.perDay.map((d) => (
            <span key={d.day} title={`${d.day}: ${d.count}`}>
              <i style={{ height: `${Math.max(3, (d.count / maxDay) * 100)}%` }} />
            </span>
          ))}
        </div>
      </section>

      <div className="admin-two-col">
        {/* Readiness funnel + movement */}
        <section className="card">
          <p className="label">Readiness funnel · movement vs ~30 days ago</p>
          {LEVELS.map((l) => {
            const now = data.readinessNow[l.level];
            const before = data.readinessMonthAgo[l.level];
            const moved = now - before;
            return (
              <div key={l.level} className="funnel-row">
                <span className="funnel-label">{l.level}</span>
                <span className="funnel-bar">
                  <i style={{ width: `${(now / readinessTotal) * 100}%`, background: l.color }} />
                </span>
                <span className="funnel-count">
                  {now}
                  {moved !== 0 && (
                    <em style={{ color: moved > 0 ? 'var(--aurora-teal)' : 'var(--text-muted)' }}>
                      {' '}
                      {moved > 0 ? `+${moved}` : moved}
                    </em>
                  )}
                </span>
              </div>
            );
          })}
          <p className="stat-sub" style={{ marginTop: 'var(--space-3)' }}>
            Movement toward interview-ready is the number that matters — not who's ahead.
          </p>
        </section>

        {/* Hot topics */}
        <section className="card">
          <p className="label">Hot topics · what students are drilling</p>
          {data.hotTopics.length === 0 && (
            <p className="stat-sub">No interviews yet — this fills in as students practice.</p>
          )}
          {data.hotTopics.map((t) => (
            <div key={t.topicKey} className="funnel-row">
              <span className="funnel-label">{t.topicLabel}</span>
              <span className="funnel-bar">
                <i style={{ width: `${(t.attempts / maxTopic) * 100}%`, background: 'var(--aurora-violet)' }} />
              </span>
              <span className="funnel-count">
                {t.attempts}
                <em style={{ color: 'var(--text-muted)' }}> · avg {t.avgScore ?? '—'}</em>
              </span>
            </div>
          ))}
        </section>
      </div>

      {/* Common weaknesses — the dean slide */}
      <section className="card beam-top">
        <p className="label">Where the cohort needs coaching · anonymized patterns</p>
        {data.commonWeaknesses.length === 0 && (
          <p className="stat-sub">Patterns appear once students have coaching reports.</p>
        )}
        {data.commonWeaknesses.map((w) => (
          <div key={w.theme} className="funnel-row">
            <span className="funnel-label" style={{ flexBasis: '40%' }}>
              {w.theme}
            </span>
            <span className="funnel-bar">
              <i style={{ width: `${w.pct}%`, background: 'var(--aurora-magenta)' }} />
            </span>
            <span className="funnel-count">{w.pct}% of students</span>
          </div>
        ))}
        <p className="stat-sub" style={{ marginTop: 'var(--space-3)' }}>
          Pattern-level only — built for planning workshops, not for calling anyone out.
        </p>
      </section>
    </div>
  );
}
