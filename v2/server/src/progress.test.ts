import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { config } from './config.js';
import { FileSessionStore } from './store/fileStore.js';
import type { ChatMessage, GroqClient } from './llm/groq.js';

const usage = { inputTokens: 10, outputTokens: 10 };

/** Deterministic Groq stand-in; records brief prompts so we can assert exclusions. */
const briefPrompts: string[] = [];

const fakeGroq: GroqClient = {
  async chat(_model: string, messages: ChatMessage[]) {
    const prompt = messages[messages.length - 1]?.content ?? '';
    if (prompt.includes('Create an interview brief') || prompt.includes('drill brief')) {
      briefPrompts.push(prompt);
      const total = Number(prompt.match(/exactly (\d+)/)?.[1] ?? config.totalQuestions);
      const stamp = briefPrompts.length;
      return {
        text: JSON.stringify({
          title: 'Practice: Testing',
          summary: 'A short practice round.',
          focusAreas: ['Basics'],
          questionBank: Array.from({ length: total }, (_, i) => `Round${stamp} Question ${i + 1}?`),
          rubric: ['Clarity'],
        }),
        usage,
      };
    }
    if (prompt.includes('Write their coaching report')) {
      return {
        text: JSON.stringify({
          overall: { score: 70, readinessLevel: 'developing', summary: 'Nice work.' },
          highlights: ['You explained X clearly.'],
          oneThingToFix: { title: 'Add concrete examples', why: 'because', how: 'practice' },
          swot: { strengths: ['s'], weaknesses: ['vague answers'], opportunities: ['mock more'], threats: ['t'] },
          perQuestion: [],
          ...(prompt.includes('progressNote')
            ? { progressNote: 'Last time: vague. This time: tighter — fixed.' }
            : {}),
        }),
        usage,
      };
    }
    return {
      text: JSON.stringify({ acknowledgement: 'Got it.', action: 'advance', followUpQuestion: '' }),
      usage,
    };
  },
  async transcribe() {
    return { text: 'transcribed', durationSeconds: 1 };
  },
};

async function finishInterview(
  app: ReturnType<typeof createApp>,
  studentId: string | null,
): Promise<string> {
  const headers = studentId ? { 'X-Student-Id': studentId } : {};
  const create = await request(app)
    .post('/api/session')
    .set(headers)
    .send({ mode: 'skill', skill: 'sql', level: 'beginner', difficulty: 'standard' });
  const id = create.body.id as string;
  for (let i = 0; i < config.totalQuestions; i++) {
    await request(app)
      .post(`/api/session/${id}/answer`)
      .send({ text: `a solid detailed answer ${i}` });
  }
  for (let tries = 0; tries < 30; tries++) {
    const res = await request(app).get(`/api/session/${id}/report`);
    if (res.body.status === 'ready') break;
    await new Promise((r) => setTimeout(r, 40));
  }
  return id;
}

describe('student progress loop', () => {
  let app: ReturnType<typeof createApp>;
  let studentId: string;

  beforeAll(async () => {
    const dir = path.join(os.tmpdir(), `interview-progress-${Date.now()}-${Math.random()}`);
    app = createApp(new FileSessionStore(dir), fakeGroq);
    const res = await request(app)
      .post('/api/student')
      .send({ handle: 'amara@college.edu', name: 'Amara' });
    expect(res.status).toBe(200);
    studentId = res.body.id as string;
  });

  it('claims an anonymous first interview after the fact', async () => {
    const sessionId = await finishInterview(app, null);
    const claim = await request(app)
      .post(`/api/session/${sessionId}/claim`)
      .set('X-Student-Id', studentId);
    expect(claim.status).toBe(200);
    const list = await request(app)
      .get('/api/student/interviews')
      .set('X-Student-Id', studentId);
    expect(list.body.interviews.some((s: { id: string }) => s.id === sessionId)).toBe(true);
  });

  it('excludes prior questions on a repeat topic and notes progress', async () => {
    // (the claimed session above already counts as attempt #1 on skill:sql)
    await finishInterview(app, studentId);
    // Second attempt's brief prompt carries the first attempt's questions as exclusions.
    expect(briefPrompts.at(-1)).toContain('ALREADY been asked');
    expect(briefPrompts.at(-1)).toContain('Question 1?');

    const progress = await request(app)
      .get('/api/student/progress?topic=skill:sql')
      .set('X-Student-Id', studentId);
    expect(progress.status).toBe(200);
    expect(progress.body.attempts.length).toBeGreaterThanOrEqual(2);
    const latest = progress.body.attempts.at(-1);
    expect(latest.progressNote).toContain('fixed');
  });

  it('builds a 3-question weak spot drill from report history', async () => {
    const drill = await request(app).post('/api/student/drill').set('X-Student-Id', studentId);
    expect(drill.status).toBe(200);
    expect(drill.body.kind).toBe('drill');
    expect(drill.body.total).toBe(3);
    expect(drill.body.brief.questionBank).toHaveLength(3);
  });

  it('refuses a drill with no history', async () => {
    const fresh = await request(app)
      .post('/api/student')
      .send({ handle: 'newbie@college.edu' });
    const drill = await request(app)
      .post('/api/student/drill')
      .set('X-Student-Id', fresh.body.id as string);
    expect(drill.status).toBe(400);
  });

  it('reports streak in /me and deletes cascade', async () => {
    const me = await request(app).get('/api/student/me').set('X-Student-Id', studentId);
    expect(me.body.interviewsThisWeek).toBeGreaterThanOrEqual(3);

    const del = await request(app).delete('/api/student/me').set('X-Student-Id', studentId);
    expect(del.status).toBe(200);
    const after = await request(app).get('/api/student/me').set('X-Student-Id', studentId);
    expect(after.status).toBe(401);
  });

  it('cannot delete an interview that is not yours', async () => {
    const owner = await request(app).post('/api/student').send({ handle: 'owner@college.edu' });
    const sessionId = await finishInterview(app, owner.body.id as string);
    const stranger = await request(app).post('/api/student').send({ handle: 'else@college.edu' });
    const res = await request(app)
      .delete(`/api/session/${sessionId}`)
      .set('X-Student-Id', stranger.body.id as string);
    expect(res.status).toBe(404);
    const mine = await request(app)
      .delete(`/api/session/${sessionId}`)
      .set('X-Student-Id', owner.body.id as string);
    expect(mine.status).toBe(200);
  });
});
