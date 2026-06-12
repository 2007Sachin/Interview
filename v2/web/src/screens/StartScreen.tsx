import { useState } from 'react';
import type { CreateSessionInput, Difficulty, InterviewMode } from '../lib/api';

const DIFFICULTY_CHIPS: { value: Difficulty; label: string; hint: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Warm-up depth, gentle pace' },
  { value: 'standard', label: 'Standard', hint: 'Typical entry-level depth' },
  { value: 'hard', label: 'Hard', hint: 'Demanding, real-interview probing' },
];

const MODE_CHIPS: { mode: InterviewMode; label: string }[] = [
  { mode: 'skill', label: 'A skill interview' },
  { mode: 'capstone', label: 'Defend my capstone' },
  { mode: 'resume', label: 'My resume' },
];

interface Props {
  busy: boolean;
  error: string;
  /** Pre-fills the form, e.g. "Interview again" from the report. */
  initial?: CreateSessionInput;
  onSubmit: (input: CreateSessionInput) => void;
  /** Present when the student has saved progress — link back to My Interviews. */
  onHome?: () => void;
  /** Whether the student has saved progress — controls the privacy disclosure. */
  signedIn?: boolean;
}

export function StartScreen({ busy, error, initial, onSubmit, onHome, signedIn }: Props) {
  const [mode, setMode] = useState<InterviewMode>(initial?.mode ?? 'skill');
  const [skill, setSkill] = useState(initial?.skill ?? '');
  const [level, setLevel] = useState(initial?.level ?? 'beginner');
  const [resumeText, setResumeText] = useState(initial?.resumeText ?? '');
  const [file, setFile] = useState<File | null>(initial?.capstoneFile ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'standard');

  const ready =
    mode === 'skill' ? skill.trim() !== '' : mode === 'resume' ? resumeText.trim() !== '' : !!file;

  function submit() {
    if (!ready || busy) return;
    onSubmit({
      mode,
      skill: skill.trim(),
      level,
      resumeText: resumeText.trim(),
      capstoneFile: file ?? undefined,
      difficulty,
    });
  }

  return (
    <main className="screen enter">
      {onHome && (
        <button
          className="btn btn-quiet"
          style={{ alignSelf: 'flex-start', marginBottom: 'var(--space-4)' }}
          onClick={onHome}
        >
          ← My interviews
        </button>
      )}
      <p className="screen-kicker">Interview practice</p>
      <h1>What are you practicing for?</h1>
      <span className="beam" aria-hidden="true" />
      <p className="screen-sub">
        Pick one — we'll build a short practice interview around it. About 7 minutes, and you
        control the pace the whole way.
      </p>

      <div className="chip-row" role="radiogroup" aria-label="Practice mode">
        {MODE_CHIPS.map((c) => (
          <button
            key={c.mode}
            className={`chip ${mode === c.mode ? 'selected' : ''}`}
            role="radio"
            aria-checked={mode === c.mode}
            onClick={() => setMode(c.mode)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="card beam-top start-panel" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {mode === 'skill' && (
          <>
            <label className="field">
              <span className="label">Which skill?</span>
              <input
                className="field-input"
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                placeholder="e.g. SQL, React, marketing analytics"
              />
            </label>
            <label className="field">
              <span className="label">Where are you right now?</span>
              <select
                className="field-input"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="beginner">Just getting started</option>
                <option value="intermediate">Comfortable with the basics</option>
                <option value="advanced">Pretty confident already</option>
              </select>
            </label>
          </>
        )}

        {mode === 'resume' && (
          <label className="field">
            <span className="label">Paste your resume text</span>
            <textarea
              className="field-input"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste the text of your resume here — formatting doesn't matter."
            />
          </label>
        )}

        {mode === 'capstone' && (
          <label className="field">
            <span className="label">Upload your capstone PDF (max 10 MB)</span>
            <input
              className="field-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <span style={{ fontSize: 'var(--fs-small)', color: 'var(--text-secondary)' }}>
                Using: {file.name}
              </span>
            )}
          </label>
        )}

        <div className="field">
          <span className="label">How tough should this round be?</span>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }} role="radiogroup" aria-label="Difficulty">
            {DIFFICULTY_CHIPS.map((d) => (
              <button
                key={d.value}
                className={`chip ${difficulty === d.value ? 'selected' : ''}`}
                style={{ fontSize: 'var(--fs-small)', padding: 'var(--space-2) var(--space-4)' }}
                role="radio"
                aria-checked={difficulty === d.value}
                data-tip={d.hint}
                onClick={() => setDifficulty(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary" onClick={submit} disabled={!ready || busy}>
          {busy ? 'Building your interview…' : 'Set up my interview'}
        </button>
        {busy && (
          <div style={{ display: 'grid', gap: 'var(--space-2)' }} aria-hidden="true">
            <p className="label" style={{ margin: 0 }}>
              Designing questions just for you
            </p>
            <div className="skeleton" style={{ width: '55%' }} />
            <div className="skeleton" style={{ width: '88%' }} />
            <div className="skeleton" style={{ width: '72%' }} />
          </div>
        )}
        {error && <p className="error-note">{error}</p>}
      </div>

      <p
        style={{
          marginTop: 'var(--space-4)',
          fontSize: 'var(--fs-small)',
          color: 'var(--text-muted)',
          maxWidth: '52ch',
        }}
      >
        {signedIn
          ? 'Heads-up: your college placement team can see your practice progress (topics, scores, readiness) — never raw recordings. You can delete any interview, or all of it, anytime.'
          : 'Heads-up: if you save your progress after this round, your college placement team can see your practice progress (topics, scores, readiness) — never raw recordings. You can delete any interview, or all of it, anytime.'}
      </p>
    </main>
  );
}
