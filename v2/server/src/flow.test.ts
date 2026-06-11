import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { config } from './config.js';
import { FileSessionStore } from './store/fileStore.js';
import type { ChatMessage, GroqClient } from './llm/groq.js';

const usage = { inputTokens: 10, outputTokens: 10 };

/** Deterministic Groq stand-in so the whole session flow runs offline. */
const fakeGroq: GroqClient = {
  async chat(_model: string, messages: ChatMessage[]) {
    const prompt = messages[messages.length - 1]?.content ?? '';
    if (prompt.includes('interview brief')) {
      return {
        text: JSON.stringify({
          title: 'Practice: Testing',
          summary: 'A short practice round.',
          focusAreas: ['Basics'],
          questionBank: Array.from({ length: config.totalQuestions }, (_, i) => `Question ${i + 1}?`),
          rubric: ['Clarity'],
        }),
        usage,
      };
    }
    if (prompt.includes('coaching report') || prompt.includes('Write their coaching report')) {
      return {
        text: JSON.stringify({
          overall: { score: 72, readinessLevel: 'developing', summary: 'Nice work.' },
          highlights: ['You explained X clearly.'],
          oneThingToFix: { title: 'Add examples', why: 'because', how: 'practice' },
          swot: { strengths: ['s'], weaknesses: ['w'], opportunities: ['o'], threats: ['t'] },
          perQuestion: [
            { question: 'Question 1?', answerSummary: 'sum', score: 70, feedback: 'f', howToImprove: 'h' },
          ],
        }),
        usage,
      };
    }
    // Turn decision: follow up when the student says "shallow".
    const followUp = prompt.includes('shallow answer here');
    return {
      text: JSON.stringify({
        acknowledgement: 'Got it, thanks.',
        action: followUp ? 'follow_up' : 'advance',
        followUpQuestion: followUp ? 'Can you go deeper?' : '',
      }),
      usage,
    };
  },
  async transcribe() {
    return { text: 'transcribed audio answer', durationSeconds: 4.2 };
  },
};

function makeApp() {
  const dir = path.join(os.tmpdir(), `interview-test-${Date.now()}-${Math.random()}`);
  return createApp(new FileSessionStore(dir), fakeGroq);
}

describe('session flow', () => {
  let app: ReturnType<typeof createApp>;
  beforeAll(() => {
    app = makeApp();
  });

  it('rejects bad modes', async () => {
    const res = await request(app).post('/api/session').send({ mode: 'nope' });
    expect(res.status).toBe(400);
  });

  it('runs a full skill interview: create, answer, follow-up, finish, report', async () => {
    const create = await request(app)
      .post('/api/session')
      .send({ mode: 'skill', skill: 'testing', level: 'beginner' });
    expect(create.status).toBe(200);
    expect(create.body.brief.questionBank).toHaveLength(config.totalQuestions);
    expect(create.body.currentPrompt).toBe('Question 1?');
    const id = create.body.id as string;

    // Shallow answer triggers exactly one follow-up, index does not advance.
    const followUp = await request(app)
      .post(`/api/session/${id}/answer`)
      .send({ text: 'shallow answer here' });
    expect(followUp.body.isFollowUp).toBe(true);
    expect(followUp.body.questionIndex).toBe(0);

    // Even a "shallow" answer to a follow-up must advance (max one follow-up).
    const afterFollowUp = await request(app)
      .post(`/api/session/${id}/answer`)
      .send({ text: 'shallow answer here' });
    expect(afterFollowUp.body.isFollowUp).toBe(false);
    expect(afterFollowUp.body.questionIndex).toBe(1);

    // Empty answer asks for a retry without advancing.
    const empty = await request(app).post(`/api/session/${id}/answer`).send({ text: '...' });
    expect(empty.body.retry).toBe(true);
    expect(empty.body.questionIndex).toBe(1);

    // Answer the rest.
    let last: Record<string, unknown> = {};
    for (let i = 1; i < config.totalQuestions; i++) {
      const res = await request(app)
        .post(`/api/session/${id}/answer`)
        .send({ text: `a solid detailed answer number ${i}` });
      last = res.body;
    }
    expect(last.done).toBe(true);

    // Report becomes ready (background generation).
    let report: Record<string, unknown> = {};
    for (let tries = 0; tries < 20; tries++) {
      const res = await request(app).get(`/api/session/${id}/report`);
      report = res.body;
      if (report.status === 'ready') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(report.status).toBe('ready');
    const body = report.report as { overall: { readinessLevel: string }; partial: boolean };
    expect(body.overall.readinessLevel).toBe('developing');
    expect(body.partial).toBe(false);
  });

  it('ending early still produces a partial report', async () => {
    const create = await request(app)
      .post('/api/session')
      .send({ mode: 'skill', skill: 'testing', level: 'beginner' });
    const id = create.body.id as string;
    await request(app).post(`/api/session/${id}/answer`).send({ text: 'one good answer about tests' });
    await request(app).post(`/api/session/${id}/end`);

    let report: Record<string, unknown> = {};
    for (let tries = 0; tries < 20; tries++) {
      const res = await request(app).get(`/api/session/${id}/report`);
      report = res.body;
      if (report.status === 'ready') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(report.status).toBe('ready');
    expect((report.report as { partial: boolean }).partial).toBe(true);
  });

  it('resumes state from the store via GET', async () => {
    const create = await request(app)
      .post('/api/session')
      .send({ mode: 'skill', skill: 'testing', level: 'beginner' });
    const id = create.body.id as string;
    await request(app).post(`/api/session/${id}/answer`).send({ text: 'a fine detailed answer' });
    const got = await request(app).get(`/api/session/${id}`);
    expect(got.status).toBe(200);
    expect(got.body.questionIndex).toBe(1);
    expect(got.body.lastTranscript).toContain('a fine detailed answer');
  });
});
