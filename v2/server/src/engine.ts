import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { emptyCost, logSessionCost } from './cost.js';
import { generateBrief, generateDrillBrief } from './llm/brief.js';
import { generateReport } from './llm/report.js';
import { decideTurn } from './llm/turn.js';
import type { GroqClient } from './llm/groq.js';
import { sanitizeForPrompt } from './sanitize.js';
import type { SessionStore } from './store/SessionStore.js';
import type { AnswerResponse, Difficulty, InterviewMode, Session } from './types.js';

export const DRILL_QUESTIONS = 3;

export interface CreateSessionOptions {
  mode: InterviewMode;
  material: string;
  label: string;
  difficulty: Difficulty;
  studentId: string | null;
}

export class InterviewEngine {
  constructor(
    private store: SessionStore,
    private groq: GroqClient,
  ) {}

  /** Normalized key so repeat attempts on the same topic group together. */
  static topicKey(mode: InterviewMode, label: string): string {
    return mode === 'skill' ? `skill:${label.trim().toLowerCase()}` : mode;
  }

  private blankSession(partial: Pick<Session, 'mode' | 'kind' | 'inputSummary' | 'topicKey' | 'difficulty' | 'totalQuestions' | 'studentId' | 'brief' | 'cost'>): Session {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'active',
      currentQuestionIndex: 0,
      followUpUsedForCurrent: false,
      currentPrompt: partial.brief.questionBank[0] ?? '',
      currentPromptIsFollowUp: false,
      turns: [],
      report: null,
      reportStatus: 'none',
      costUsd: 0,
      ...partial,
    };
  }

  /** Questions this student has already been asked on a topic. */
  private async priorQuestions(studentId: string | null, topicKey: string): Promise<string[]> {
    if (!studentId) return [];
    const prior = await this.store.listTopicSessions(studentId, topicKey);
    return prior.flatMap((s) => s.brief.questionBank).slice(-40);
  }

  async createSession(opts: CreateSessionOptions): Promise<Session> {
    const cleanMaterial = sanitizeForPrompt(opts.material);
    const cost = emptyCost();
    const topicKey = InterviewEngine.topicKey(opts.mode, opts.label);
    const excludeQuestions = await this.priorQuestions(opts.studentId, topicKey);
    const brief = await generateBrief(this.groq, cost, opts.mode, cleanMaterial, opts.label, {
      difficulty: opts.difficulty,
      total: config.totalQuestions,
      excludeQuestions,
    });
    const session = this.blankSession({
      mode: opts.mode,
      kind: 'interview',
      inputSummary: opts.label,
      topicKey,
      difficulty: opts.difficulty,
      totalQuestions: config.totalQuestions,
      studentId: opts.studentId,
      brief,
      cost,
    });
    await this.store.create(session);
    return session;
  }

  /**
   * Weak-spot drill: 3 questions generated only from the student's
   * accumulated weaknesses / one-thing-to-fix history.
   */
  async createDrill(studentId: string): Promise<Session | null> {
    const summaries = await this.store.listByStudent(studentId);
    const weaknesses: string[] = [];
    const asked: string[] = [];
    for (const summary of summaries.slice(0, 12)) {
      const full = await this.store.get(summary.id);
      if (!full?.report) continue;
      asked.push(...full.brief.questionBank);
      weaknesses.push(
        `From "${full.inputSummary}": fix = ${full.report.oneThingToFix.title} (${full.report.oneThingToFix.why})`,
        ...full.report.swot.weaknesses.map((w) => `From "${full.inputSummary}": weakness = ${w}`),
      );
    }
    if (weaknesses.length === 0) return null;

    const cost = emptyCost();
    const brief = await generateDrillBrief(
      this.groq,
      cost,
      sanitizeForPrompt(weaknesses.slice(0, 20).join('\n'), 6000),
      { difficulty: 'standard', total: DRILL_QUESTIONS, excludeQuestions: asked.slice(-40) },
    );
    const session = this.blankSession({
      mode: 'skill',
      kind: 'drill',
      inputSummary: 'Weak spot drill',
      topicKey: 'drill',
      difficulty: 'standard',
      totalQuestions: DRILL_QUESTIONS,
      studentId,
      brief,
      cost,
    });
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
    const total = session.totalQuestions ?? config.totalQuestions;

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
      session.difficulty ?? 'standard',
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

  /** oneThingToFix from the previous completed attempt on the same topic. */
  private async previousFix(session: Session): Promise<string | null> {
    if (!session.studentId || session.kind === 'drill') return null;
    const prior = await this.store.listTopicSessions(session.studentId, session.topicKey);
    const previous = prior
      .filter((s) => s.id !== session.id && s.report)
      .at(-1);
    return previous?.report?.oneThingToFix.title ?? null;
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
        const previousFix = await this.previousFix(session);
        const report = await generateReport(this.groq, session.cost, session, previousFix);
        session.report = report;
        session.reportStatus = 'ready';
        session.status = 'done';
        session.costUsd = logSessionCost(session.id, session.cost, session.studentId);
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
