import { config } from '../config.js';
import type { GroqClient } from './groq.js';
import { safeParseJson, asString, asStringArray, asNumber } from './safeJson.js';
import type { CostLog, ReadinessLevel, Report, Session } from '../types.js';

function transcriptText(session: Session): string {
  return session.turns
    .map((t) => `Q${t.questionIndex + 1}${t.isFollowUp ? ' (follow-up)' : ''}: ${t.prompt}\nStudent: ${t.transcript}`)
    .join('\n\n');
}

function fallbackReport(session: Session): Report {
  const partial = session.turns.length < config.totalQuestions;
  return {
    overall: {
      score: 50,
      readinessLevel: 'developing',
      summary:
        'We had trouble generating your full analysis this time, but showing up and practicing out loud is the work that matters. Your transcript is saved — try generating the report again, or run another round.',
    },
    highlights: ['You completed spoken practice — that alone builds the muscle most students avoid.'],
    oneThingToFix: {
      title: 'Run the interview again',
      why: 'We could not analyze this session in detail.',
      how: 'Start a fresh interview; your setup is saved so it only takes one click.',
    },
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    perQuestion: session.turns
      .filter((t) => !t.isFollowUp)
      .map((t) => ({
        question: t.prompt,
        answerSummary: t.transcript.slice(0, 200),
        score: 50,
        feedback: 'Detailed feedback unavailable for this session.',
        howToImprove: 'Try this question again in your next round.',
      })),
    partial,
  };
}

const READINESS: ReadinessLevel[] = ['needs practice', 'developing', 'interview-ready'];

export async function generateReport(
  groq: GroqClient,
  cost: CostLog,
  session: Session,
): Promise<Report> {
  const partial = session.currentQuestionIndex < config.totalQuestions - 1 || session.turns.length === 0;
  const answered = session.turns.filter((t) => !t.isFollowUp).length;
  const prompt = `You are ${config.interviewerName}, a warm interview coach. A college student just finished a practice interview${partial ? ` early, after ${answered} of ${config.totalQuestions} questions — judge only what they answered and never penalize stopping early` : ''}. Write their coaching report.

INTERVIEW BRIEF:
Title: ${session.brief.title}
Focus areas: ${session.brief.focusAreas.join('; ')}
Rubric: ${session.brief.rubric.join('; ')}

FULL TRANSCRIPT:
${transcriptText(session) || '(no answers recorded)'}

Respond as JSON with exactly this shape:
{
  "overall": { "score": 0-100, "readinessLevel": "needs practice" | "developing" | "interview-ready", "summary": "3-4 encouraging coach sentences" },
  "highlights": ["2-3 specific things done WELL, each quoting or directly referencing something the student actually said"],
  "oneThingToFix": { "title": "the single highest-impact improvement", "why": "why it matters, anchored to their answers", "how": "concrete practice steps" },
  "swot": { "strengths": [...], "weaknesses": [...], "opportunities": [...], "threats": [...] },
  "perQuestion": [ for each main question answered: { "question": "...", "answerSummary": "...", "score": 0-100, "feedback": "...", "howToImprove": "..." } ]
}

Rules: every SWOT point (2-4 per quadrant) must be anchored to something specific the student said — no generic filler. Coach tone throughout: honest about gaps but framed as next steps, never as judgment. Output ONLY the JSON object.`;

  let parsed: unknown = null;
  try {
    const result = await groq.chat(
      config.modelSmart,
      [{ role: 'user', content: prompt }],
      { json: true, maxTokens: 4096 },
    );
    cost.smartInputTokens += result.usage.inputTokens;
    cost.smartOutputTokens += result.usage.outputTokens;
    parsed = safeParseJson(result.text);
  } catch (err) {
    console.error('[report] generation failed:', err);
  }

  const fallback = fallbackReport(session);
  if (parsed === null || typeof parsed !== 'object') return fallback;
  const obj = parsed as Record<string, unknown>;

  const overall = (obj.overall ?? {}) as Record<string, unknown>;
  const fix = (obj.oneThingToFix ?? {}) as Record<string, unknown>;
  const swot = (obj.swot ?? {}) as Record<string, unknown>;
  const readiness = READINESS.includes(overall.readinessLevel as ReadinessLevel)
    ? (overall.readinessLevel as ReadinessLevel)
    : fallback.overall.readinessLevel;

  const perQuestionRaw = Array.isArray(obj.perQuestion) ? obj.perQuestion : [];
  const perQuestion = perQuestionRaw
    .filter((q): q is Record<string, unknown> => typeof q === 'object' && q !== null)
    .map((q) => ({
      question: asString(q.question, 'Question'),
      answerSummary: asString(q.answerSummary, ''),
      score: asNumber(q.score, 50, 0, 100),
      feedback: asString(q.feedback, ''),
      howToImprove: asString(q.howToImprove, ''),
    }));

  return {
    overall: {
      score: asNumber(overall.score, fallback.overall.score, 0, 100),
      readinessLevel: readiness,
      summary: asString(overall.summary, fallback.overall.summary),
    },
    highlights: asStringArray(obj.highlights, 3).length
      ? asStringArray(obj.highlights, 3)
      : fallback.highlights,
    oneThingToFix: {
      title: asString(fix.title, fallback.oneThingToFix.title),
      why: asString(fix.why, fallback.oneThingToFix.why),
      how: asString(fix.how, fallback.oneThingToFix.how),
    },
    swot: {
      strengths: asStringArray(swot.strengths, 4),
      weaknesses: asStringArray(swot.weaknesses, 4),
      opportunities: asStringArray(swot.opportunities, 4),
      threats: asStringArray(swot.threats, 4),
    },
    perQuestion: perQuestion.length ? perQuestion : fallback.perQuestion,
    partial,
  };
}
