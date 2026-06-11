import type { Report } from '../lib/api';
import { readinessMeta, scoreLabel, SWOT_QUADRANTS } from '../lib/reportUtils';
import './report.css';

interface Props {
  report: Report;
  interviewerName: string;
  onRestart: () => void;
}

export function ReportScreen({ report, interviewerName, onRestart }: Props) {
  const meta = readinessMeta(report.overall.readinessLevel);

  return (
    <main className="screen report enter" style={{ maxWidth: 860 }}>
      <p className="screen-kicker">Your coaching report{report.partial ? ' · partial round' : ''}</p>

      {/* 1 · Readiness first, score second */}
      <section className="report-hero card">
        <div
          className="readiness-badge"
          style={{ background: meta.bgVar, color: meta.colorVar }}
        >
          {meta.label}
        </div>
        <p className="readiness-tone">{meta.tone}</p>
        <p className="report-summary">{report.overall.summary}</p>
        <p className="report-score label">Overall score · {scoreLabel(report.overall.score)}</p>
        {report.partial && (
          <p className="report-partial">
            You ended early — totally fine. This report covers what you answered.
          </p>
        )}
      </section>

      {/* 2 · What you did well */}
      <section>
        <h2 className="screen-title">What you did well</h2>
        <div className="highlight-list">
          {report.highlights.map((h, i) => (
            <div key={i} className="card highlight-card enter">
              <span className="highlight-mark">✓</span>
              <p>{h}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3 · One thing to fix */}
      <section>
        <h2 className="screen-title">Your one thing to fix</h2>
        <div className="card fix-card">
          <h3>{report.oneThingToFix.title}</h3>
          <p className="label">Why it matters</p>
          <p>{report.oneThingToFix.why}</p>
          <p className="label">How to practice it</p>
          <p>{report.oneThingToFix.how}</p>
        </div>
      </section>

      {/* 4 · SWOT 2x2 */}
      <section>
        <h2 className="screen-title">Your SWOT</h2>
        <div className="swot-grid">
          {SWOT_QUADRANTS.map((q) => (
            <div key={q.key} className="card swot-cell">
              <p className="label">{q.title}</p>
              <p className="swot-hint">{q.hint}</p>
              {report.swot[q.key].length ? (
                <ul>
                  {report.swot[q.key].map((point, i) => (
                    <li key={i}>{point}</li>
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
        <div className="pq-list">
          {report.perQuestion.map((q, i) => (
            <div key={i} className="card pq-card">
              <div className="pq-head">
                <p className="pq-question">
                  <span className="label">Q{i + 1}</span> {q.question}
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
        <p className="screen-sub">
          One focused rep beats ten unfocused ones. Your setup is saved — same topic, fresh
          questions.
        </p>
        <div className="report-cta-actions">
          <button className="btn btn-primary" onClick={onRestart}>
            Interview again
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            Save as PDF
          </button>
        </div>
      </section>
    </main>
  );
}
