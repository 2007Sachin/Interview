import type { Report } from './api';

export type Readiness = Report['overall']['readinessLevel'];

/** Maps readiness to design tokens + coach-toned framing. Never judgmental. */
export function readinessMeta(level: Readiness): {
  label: string;
  tone: string;
  colorVar: string;
  bgVar: string;
} {
  switch (level) {
    case 'interview-ready':
      return {
        label: 'Interview-ready',
        tone: "You're ready for the real thing — keep your edge sharp.",
        colorVar: 'var(--success)',
        bgVar: 'var(--success-soft)',
      };
    case 'developing':
      return {
        label: 'Developing',
        tone: "You're building real momentum — a few focused reps will get you there.",
        colorVar: 'var(--warning)',
        bgVar: 'var(--warning-soft)',
      };
    case 'needs practice':
      return {
        label: 'Needs practice',
        tone: "Every strong interviewer started here — you now know exactly what to work on.",
        colorVar: 'var(--primary)',
        bgVar: 'var(--primary-soft)',
      };
  }
}

export function scoreLabel(score: number): string {
  return `${Math.round(Math.min(100, Math.max(0, score)))} / 100`;
}

export const SWOT_QUADRANTS: { key: keyof Report['swot']; title: string; hint: string }[] = [
  { key: 'strengths', title: 'Strengths', hint: 'What you can lean on' },
  { key: 'weaknesses', title: 'Weaknesses', hint: 'What to shore up' },
  { key: 'opportunities', title: 'Opportunities', hint: 'Where you can grow fastest' },
  { key: 'threats', title: 'Threats', hint: 'What could trip you up' },
];
