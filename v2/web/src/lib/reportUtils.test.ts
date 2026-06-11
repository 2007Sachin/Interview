import { describe, expect, it } from 'vitest';
import { readinessMeta, scoreLabel, SWOT_QUADRANTS } from './reportUtils';

describe('readinessMeta', () => {
  it('covers every readiness level with token-based colors', () => {
    for (const level of ['needs practice', 'developing', 'interview-ready'] as const) {
      const meta = readinessMeta(level);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.colorVar).toMatch(/^var\(--/);
      expect(meta.bgVar).toMatch(/^var\(--/);
    }
  });

  it('keeps the coach tone (no judging words)', () => {
    const meta = readinessMeta('needs practice');
    expect(meta.tone.toLowerCase()).not.toContain('fail');
    expect(meta.tone.toLowerCase()).not.toContain('bad');
  });
});

describe('scoreLabel', () => {
  it('rounds and clamps', () => {
    expect(scoreLabel(72.4)).toBe('72 / 100');
    expect(scoreLabel(140)).toBe('100 / 100');
    expect(scoreLabel(-5)).toBe('0 / 100');
  });
});

describe('SWOT quadrants', () => {
  it('renders all four quadrants in order', () => {
    expect(SWOT_QUADRANTS.map((q) => q.key)).toEqual([
      'strengths',
      'weaknesses',
      'opportunities',
      'threats',
    ]);
  });
});
