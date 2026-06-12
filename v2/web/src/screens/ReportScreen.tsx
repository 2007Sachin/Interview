import { useEffect, useState } from 'react';
import type { Report } from '../lib/api';
import { prefersReducedMotion } from '../lib/audio';
import { readinessMeta, scoreLabel, SWOT_QUADRANTS } from '../lib/reportUtils';
import './report.css';

interface Props {
  report: Report;
  interviewerName: string;
  topicLabel: string;
  /** Student already has a saved-progress identity in this browser. */
  signedIn: boolean;
  onRestart: () => void;
  /** "Save your progress" — creates the identity and claims this interview. */
  onSaveProgress: (handle: string, name: string) => Promise<void>;
  onTrySuggested: (topic: string) => void;
  onHome: () => void;
}

/** Counts 0 → target over ~900ms with an ease-out curve; instant under reduced motion. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

export function ReportScreen({
  report,
  interviewerName,
  topicLabel,
  signedIn,
  onRestart,
  onSaveProgress,
  onTrySuggested,
  onHome,
}: Props) {
  const meta = readinessMeta(report.overall.readinessLevel);
  const score = useCountUp(Math.round(Math.min(100, Math.max(0, report.overall.score))));
  const celebrate = report.overall.score >= 75 && !prefersReducedMotion();
  const [handleText, setHandleText] = useState('');
  const [nameText, setNameText] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const suggestedNext = report.swot.opportunities[0] ?? '';

  async function saveProgress() {
    if (!handleText.trim() || saveBusy) return;
    setSaveBusy(true);
    setSaveError('');
    try {
      await onSaveProgress(handleText.trim(), nameText.trim());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save — try again.');
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <main className="screen report enter" style={{ maxWidth: 860 }}>
      <p className="screen-kicker">Your coaching report{report.partial ? ' · partial round' : ''}</p>

      {/* 1 · Readiness first, score second — both animate in */}
      <section className="report-hero">
        {celebrate && (
          <span className="spark-field" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} className={`spark spark-${i + 1}`} />
            ))}
          </span>
        )}
        <div className="hero-main">
          <p className="label">Readiness</p>
          <h1 className="readiness-word badge-pop" style={{ color: meta.colorVar }}>
            {meta.label}
          </h1>
          <span className="beam" aria-hidden="true" />
          <p className="readiness-tone">{meta.tone}</p>
          <p className="report-summary">{report.overall.summary}</p>
          {report.partial && (
            <p className="report-partial">
              You ended early — totally fine. This report covers what you answered.
            </p>
          )}
        </div>
        <div className="hero-score" aria-label={`Overall score ${score} out of 100`}>
          <span className="hero-score-num">{score}</span>
          <span className="label">/ 100 overall</span>
        </div>
      </section>

      {/* Since last time: did they fix the one thing? */}
      {report.progressNote && (
        <section>
          <div className="card beam-top">
            <p className="label">Since last time</p>
            <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--fs-subtitle)' }}>
              {report.progressNote}
            </p>
          </div>
        </section>
      )}

      {/* Save your progress — only after the interview, never before */}
      {!signedIn && (
        <section>
          <div className="card beam-top" style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <p className="label">Save your progress</p>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Keep this report, see your score trend, and unlock the weak-spot drill. Just an
              email or college ID — no password.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input
                className="field-input"
                style={{ flex: 2, minWidth: 200 }}
                placeholder="Email or college ID"
                value={handleText}
                onChange={(e) => setHandleText(e.target.value)}
              />
              <input
                className="field-input"
                style={{ flex: 1, minWidth: 120 }}
                placeholder="First name (optional)"
                value={nameText}
                onChange={(e) => setNameText(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={() => void saveProgress()}
                disabled={!handleText.trim() || saveBusy}
              >
                {saveBusy ? 'Saving…' : 'Save my progress'}
              </button>
            </div>
            {saveError && <p className="error-note">{saveError}</p>}
          </div>
        </section>
      )}

      {/* 2 · What you did well — staggered in one by one */}
      <section>
        <h2 className="screen-title">What you did well</h2>
        <span className="beam" aria-hidden="true" />
        <div className="highlight-list">
          {report.highlights.map((h, i) => (
            <div
              key={i}
              className="card highlight-card stagger-in"
              style={{ animationDelay: `${300 + i * 75}ms` }}
            >
              <span className="highlight-mark">✓</span>
              <p>{h}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3 · One thing to fix — delayed scale entrance so it lands as the key moment */}
      <section>
        <h2 className="screen-title">Your one thing to fix</h2>
        <span className="beam" aria-hidden="true" />
        <div className="card fix-card fix-entrance beam-top">
          <h3>{report.oneThingToFix.title}</h3>
          <p className="label">Why it matters</p>
          <p>{report.oneThingToFix.why}</p>
          <p className="label">How to practice it</p>
          <p>{report.oneThingToFix.how}</p>
        </div>
      </section>

      {/* 4 · SWOT 2x2 — tiles rise in sequence */}
      <section>
        <h2 className="screen-title">Your SWOT</h2>
        <span className="beam" aria-hidden="true" />
        <div className="swot-grid">
          {SWOT_QUADRANTS.map((q, i) => (
            <div
              key={q.key}
              className="card swot-cell stagger-in"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <p className="label">{q.title}</p>
              <p className="swot-hint">{q.hint}</p>
              {report.swot[q.key].length ? (
                <ul>
                  {report.swot[q.key].map((point, j) => (
                    <li key={j}>{point}</li>
                  ))}
                </ul>
              ) : (
                <p className="swot-hint">Nothing stood out here this round.</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 5 · Per-question breakdown */}
      <section>
        <h2 className="screen-title">Question by question</h2>
        <span className="beam" aria-hidden="true" />
        <div className="pq-list">
          {report.perQuestion.map((q, i) => (
            <div
              key={i}
              className="card pq-card stagger-in"
              style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}
            >
              <div className="pq-head">
                <p className="pq-question">
                  <span className="pq-num">Q·{String(i + 1).padStart(2, '0')}</span> {q.question}
                </p>
                <span className="pq-score">{scoreLabel(q.score)}</span>
              </div>
              {q.answerSummary && (
                <p className="pq-row">
                  <span className="label">Your answer</span> {q.answerSummary}
                </p>
              )}
              {q.feedback && (
                <p className="pq-row">
                  <span className="label">{interviewerName}'s take</span> {q.feedback}
                </p>
              )}
              {q.howToImprove && (
                <p className="pq-row">
                  <span className="label">Level up</span> {q.howToImprove}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 6 · Closing call-to-action */}
      <section className="card report-cta">
        <h2 className="screen-title">Fix that one thing, then interview again</h2>
        <span className="beam" aria-hidden="true" />
        <p className="screen-sub">
          One focused rep beats ten unfocused ones. Your setup is saved — same topic, fresh
          questions.
        </p>
        <div className="report-cta-actions">
          <button className="btn btn-primary" onClick={onRestart}>
            Re-interview on {topicLabel}
          </button>
          {suggestedNext && (
            <button
              className="btn btn-secondary"
              data-tip="Drawn from your SWOT opportunities"
              onClick={() => onTrySuggested(suggestedNext)}
            >
              Next: {suggestedNext.length > 42 ? `${suggestedNext.slice(0, 42)}…` : suggestedNext}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => window.print()}>
            Save as PDF
          </button>
          {signedIn && (
            <button className="btn btn-quiet" onClick={onHome}>
              My interviews
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
