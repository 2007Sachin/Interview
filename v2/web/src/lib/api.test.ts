import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, answerWithText, getReport } from './api';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('returns parsed answers', async () => {
    mockFetch(200, {
      transcript: 'hi',
      nextPrompt: 'next?',
      isFollowUp: false,
      questionIndex: 1,
      total: 8,
      done: false,
    });
    const res = await answerWithText('abc', 'hi');
    expect(res.questionIndex).toBe(1);
    expect(res.done).toBe(false);
  });

  it('surfaces server error messages as ApiError', async () => {
    mockFetch(502, { error: 'Give it a second and try again.' });
    await expect(answerWithText('abc', 'hi')).rejects.toThrowError(
      new ApiError(502, 'Give it a second and try again.'),
    );
  });

  it('parses report polling states', async () => {
    mockFetch(200, { status: 'pending' });
    const res = await getReport('abc');
    expect(res.status).toBe('pending');
  });
});
