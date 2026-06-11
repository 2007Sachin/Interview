import { useState } from 'react';
import type { CreateSessionInput, InterviewMode } from '../lib/api';

const MODE_CHIPS: { mode: InterviewMode; label: string }[] = [
  { mode: 'skill', label: 'A skill interview' },
  { mode: 'capstone', label: 'Defend my capstone' },
  { mode: 'resume', label: 'My resume' },
];

interface Props {
  busy: boolean;
  error: string;
  onSubmit: (input: CreateSessionInput) => void;
}

export function StartScreen({ busy, error, onSubmit }: Props) {
  const [mode, setMode] = useState<InterviewMode>('skill');
  const [skill, setSkill] = useState('');
  const [level, setLevel] = useState('beginner');
  const [resumeText, setResumeText] = useState('');
  const [file, setFile] = useState<File | null>(null);

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
    });
  }

  return (
    <main className="screen enter">
      <p className="screen-kicker">Interview practice</p>
      <h1>What are you practicing for?</h1>
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

      <div className="card" style={{ display: 'grid', gap: 'var(--space-4)' }}>
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
          </label>
        )}

        <button className="btn btn-primary" onClick={submit} disabled={!ready || busy}>
          {busy ? 'Building your interview…' : 'Set up my interview'}
        </button>
        {error && <p className="error-note">{error}</p>}
      </div>
    </main>
  );
}
