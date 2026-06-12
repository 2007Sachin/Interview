import { useEffect, useState } from 'react';
import type { Report } from '../lib/api';
import { fetchSessionReport, fetchStudent, type AdminStudentDetail } from './adminApi';

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

interface Props {
  id: string;
  onBack: () => void;
  onUnauthorized: () => void;
}

export function AdminStudent({ id, onBack, onUnauthorized }: Props) {
  const [detail, setDetail] = useState<AdminStudentDetail | null>(null);
  const [openReport, setOpenReport] = useState<{ id: string; report: Report } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchStudent(id)
      .then((d) => !cancelled && setDetail(d))
      .catch((err: Error) => {
        if (cancelled) return;
        if (err.message === 'unauthorized') onUnauthorized();
        else setError('Could not load this student — go back and retry.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function viewReport(sessionId: string) {
    const report = await fetchSessionReport(sessionId);
    if (report) setOpenReport({ id: sessionId, report });
  }

  return (
    <div className="admin-grid">
      <button className="btn btn-quiet" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← All students
      </button>
      {error && <p className="error-note">{error}</p>}
      {detail && (
        <>
          <h1>{detail.student.name || detail.student.handle}</h1>
          <span className="beam" aria-hidden="true" />
          <p className="stat-sub">
            {detail.student.handle} · {detail.student.batch || detail.student.institution} ·
            practicing since {DATE_FMT.format(new Date(detail.student.createdAt))}
          </p>

          <div className="roster">
            {detail.interviews.map((s) => (
              <div key={s.id} className="roster-row" style={{ cursor: 'default' }}>
                <span className="roster-name">
                  {s.kind === 'drill' ? '⚡ ' : ''}
                  {s.topicLabel}
                  <em>
                    {DATE_FMT.format(new Date(s.createdAt))} · {s.difficulty}
                  </em>
                </span>
                <span className="roster-cell">
                  {s.readinessLevel ?? 'unfinished'}
                  {s.score !== null && ` · ${Math.round(s.score)} / 100`}
                </span>
                {s.score !== null && (
                  <button className="btn btn-quiet" onClick={() => void viewReport(s.id)}>
                    {openReport?.id === s.id ? 'Shown below' : 'View report'}
                  </button>
                )}
              </div>
            ))}
            {detail.interviews.length === 0 && (
              <p className="stat-sub">No interviews yet — they've signed up but not practiced.</p>
            )}
          </div>

          {openReport && (
            <section className="card beam-top" style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <p className="label">
                Coaching report · {openReport.report.overall.readinessLevel} ·{' '}
                {Math.round(openReport.report.overall.score)} / 100
              </p>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                {openReport.report.overall.summary}
              </p>
              {openReport.report.progressNote && (
                <p style={{ margin: 0 }}>
                  <span className="label">Since last time </span>
                  {openReport.report.progressNote}
                </p>
              )}
              <p style={{ margin: 0 }}>
                <span className="label">Working on </span>
                {openReport.report.oneThingToFix.title} — {openReport.report.oneThingToFix.why}
              </p>
              {openReport.report.highlights.length > 0 && (
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                  <span className="label">Did well </span>
                  {openReport.report.highlights.join(' · ')}
                </p>
              )}
              <button className="btn btn-quiet" style={{ justifySelf: 'start' }} onClick={() => setOpenReport(null)}>
                Close report
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
