import { describe, expect, it } from 'vitest';
import { safeParseJson, asNumber, asString, asStringArray } from './safeJson.js';

describe('safeParseJson', () => {
  it('parses plain JSON', () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    expect(safeParseJson('```json\n{"a": [1,2]}\n```')).toEqual({ a: [1, 2] });
  });

  it('extracts JSON embedded in prose', () => {
    expect(safeParseJson('Sure! Here is the report:\n{"score": 80} hope that helps')).toEqual({
      score: 80,
    });
  });

  it('handles braces inside strings', () => {
    expect(safeParseJson('x {"q": "what is {a} vs }b{?"} y')).toEqual({
      q: 'what is {a} vs }b{?',
    });
  });

  it('returns null for garbage', () => {
    expect(safeParseJson('no json here at all')).toBeNull();
    expect(safeParseJson('')).toBeNull();
    expect(safeParseJson('{"broken": ')).toBeNull();
  });
});

describe('coercion helpers', () => {
  it('asStringArray filters non-strings and clamps', () => {
    expect(asStringArray(['a', 1, '', 'b'], 2)).toEqual(['a', 'b']);
    expect(asStringArray('nope')).toEqual([]);
  });

  it('asString falls back', () => {
    expect(asString('  hi ')).toBe('hi');
    expect(asString(42, 'x')).toBe('x');
  });

  it('asNumber clamps to range', () => {
    expect(asNumber(150, 50, 0, 100)).toBe(100);
    expect(asNumber('abc', 50, 0, 100)).toBe(50);
  });
});
