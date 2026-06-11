import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { emptyCost, logSessionCost } from './cost.js';
import { generateBrief } from './llm/brief.js';
import { generateReport } from './llm/report.js';
import { decideTurn } from './llm/turn.js';
import type { GroqClient } from './llm/groq.js';
import { sanitizeForPrompt } from './sanitize.js';
import type { SessionStore } from './store/SessionStore.js';
import type { AnswerResponse, InterviewMode, Session } from './types.js';

export class InterviewEngine {
  constructor(
    private store: SessionStore,
    private groq: GroqClient,
  ) {}

  async createSession(mode: InterviewMode, material: string, label: string): Promise<Session> {
    const cleanMaterial = sanitizeForPrompt(material);
    const cost = emptyCost();
    const brief = await generateBrief(this.groq, cost, mode, cleanMaterial, label);
    const session: Session = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      mode,
      inputSummary: label,
      brief,
      status: 'active',
      currentQuestionIndex: 0,
      followUpUsedForCurrent: false,
      currentPrompt: brief.questionBank[0] ?? '',
      currentPromptIsFollowUp: false,
      turns: [],
      report: null,
      reportStatus: 'none',
      cost,
      costUsd: 0,
    };
    await this.store.create(session);
    return session;
  }

  async getSession(id: string): Promise<Session | null> {
    return this.store.get(id);
  }

  async transcribe(session: Session, audio: Buffer, mimeType: string): Promise<string> {
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    const result = await this.groq.transcribe(audio, `answer.${ext}`, mimeType);
    session.cost.sttSeconds += result.durationSeconds;
    return result.text;
  }

  /**
   * Core turn: record the answer against the current prompt, then either ask
   * one follow-up (max one per question) or advance. The server owns the
   * question index — clients only ever submit "an answer to the current prompt".
   */
  async submitAnswer(
    session: Session,
    transcript: string,
    source: 'audio' | 'text',
  ): Promise<AnswerResponse> {
    const total = config.totalQuestions;

    if (session.status !== 'active') {
      return {
        transcript,
        nextPrompt: '',
        isFollowUp: false,
        questionIndex: Math.min(session.currentQuestionIndex, total - 1),
        total,
        done: true,
      };
    }

    const cleaned = sanitizeForPrompt(transcript, 8000);
    if (cleaned.replace(/[^\p{L}\p{N}]/gu, '').length < 2) {
      // Empty or inaudible: don't advance, let the client offer a gentle retry.
      await this.store.save(session);
      return {
        transcript: cleaned,
        nextPrompt: session.currentPrompt,
        isFollowUp: session.currentPromptIsFollowUp,
        questionIndex: session.currentQuestionIndex,
        total,
        done: false,
        retry: true,
      };
    }

    session.turns.push({
      questionIndex: session.currentQuestionIndex,
      prompt: session.currentPrompt,
      isFollowUp: session.currentPromptIsFollowUp,
      transcript: cleaned,
      source,
      answeredAt: new Date().toISOString(),
    });

    const followUpAllowed = !session.followUpUsedForCurrent && !session.currentPromptIsFollowUp;
    const decision = await decideTurn(
      this.groq,
      session.cost,
      session.currentPrompt,
      cleaned,
      followUpAllowed,
    );

    let response: AnswerResponse;
    if (decision.action === 'follow_up') {
      session.followUpUsedForCurrent = true;
      session.currentPrompt = decision.followUpQuestion;
      session.currentPromptIsFollowUp = true;
      response = {
        transcript: cleaned,
        nextPrompt: `${decision.acknowledgement} ${decision.followUpQuestion}`,
        isFollowUp: true,
        questionIndex: session.currentQuestionIndex,
        total,
        done: false,
      };
    } else {
      const nextIndex = session.currentQuestionIndex + 1;
      if (nextIndex >= total) {
        session.status = 'wrapup';
        response = {
          transcript: cleaned,
          nextPrompt: decision.acknowledgement,
          isFollowUp: false,
          questionIndex: session.currentQuestionIndex,
          total,
          done: true,
        };
      } else {
        const nextQuestion = session.brief.questionBank[nextIndex] ?? '';
        session.currentQuestionIndex = nextIndex;
        session.followUpUsedForCurrent = false;
        session.currentPrompt = nextQuestion;
        session.currentPromptIsFollowUp = false;
        response = {
          transcript: cleaned,
          nextPrompt: `${decision.acknowledgement} ${nextQuestion}`,
          isFollowUp: false,
          questionIndex: nextIndex,
          total,
          done: false,
        };
      }
    }

    await this.store.save(session);
    if (response.done) this.startReport(session.id);
    return response;
  }

  /** End early (always allowed) — still produces a partial report. */
  async endSession(id: string): Promise<void> {
    const session = await this.store.get(id);
    if (!session || session.status === 'done') return;
    if (session.status === 'active') {
      session.status = 'wrapup';
      await this.store.save(session);
    }
    this.startReport(id);
  }

  private reportsInFlight = new Set<string>();

  /** Kick off report generation in the background; idempotent. */
  startReport(id: string): void {
    if (this.reportsInFlight.has(id)) return;
    this.reportsInFlight.add(id);
    void (async () => {
      try {
        const session = await this.store.get(id);
        if (!session || session.reportStatus === 'generating' || session.reportStatus === 'ready') {
          return;
        }
        session.reportStatus = 'generating';
        await this.store.save(session);
        const report = await generateReport(this.groq, session.cost, session);
        session.report = report;
        session.reportStatus = 'ready';
        session.status = 'done';
        session.costUsd = logSessionCost(session.id, session.cost);
        await this.store.save(session);
      } catch (err) {
        console.error(`[report] background generation failed for ${id}:`, err);
        const session = await this.store.get(id);
        if (session) {
          session.reportStatus = 'failed';
          await this.store.save(session);
        }
      } finally {
        this.reportsInFlight.delete(id);
      }
    })();
  }
}
