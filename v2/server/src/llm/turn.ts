import { config } from '../config.js';
import type { GroqClient } from './groq.js';
import { safeParseJson, asString } from './safeJson.js';
import type { CostLog, Difficulty } from '../types.js';

/** Follow-up strictness scales with difficulty. */
const DIFFICULTY_FOLLOWUP: Record<Difficulty, string> = {
  easy: '"follow_up" ONLY if the answer was essentially empty or completely off-topic — on easy difficulty we let imperfect answers pass to build confidence',
  standard: '"follow_up" if the answer was shallow, vague or missed the point and ONE short probe would help them go deeper, otherwise "advance"',
  hard: '"follow_up" unless the answer was specific, well-structured AND backed by a concrete example — on hard difficulty we probe like a real demanding interviewer (still ONE short probe, never hostile)',
};

export interface TurnDecision {
  action: 'follow_up' | 'advance';
  acknowledgement: string;
  followUpQuestion: string;
}

/**
 * Per-turn logic runs on the FAST model: acknowledge the answer and decide
 * whether one short follow-up is warranted before moving on.
 */
export async function decideTurn(
  groq: GroqClient,
  cost: CostLog,
  question: string,
  answer: string,
  followUpAllowed: boolean,
  difficulty: Difficulty = 'standard',
): Promise<TurnDecision> {
  const prompt = `You are ${config.interviewerName}, a warm, encouraging interview coach running a practice interview with a college student.

The student was asked: "${question}"
The student answered: "${answer}"

Decide the next move and reply as JSON:
{
  "acknowledgement": "one short, natural, encouraging spoken sentence reacting to their answer (never judgmental, never empty praise — react to what they actually said)",
  "action": ${followUpAllowed ? DIFFICULTY_FOLLOWUP[difficulty] : '"advance" (a follow-up was already used for this question)'},
  "followUpQuestion": "if action is follow_up: one short spoken follow-up question, else empty string"
}

Output ONLY the JSON object.`;

  const fallback: TurnDecision = {
    action: 'advance',
    acknowledgement: 'Thanks for sharing that.',
    followUpQuestion: '',
  };

  try {
    const result = await groq.chat(
      config.modelFast,
      [{ role: 'user', content: prompt }],
      { json: true, maxTokens: 300 },
    );
    cost.fastInputTokens += result.usage.inputTokens;
    cost.fastOutputTokens += result.usage.outputTokens;
    const parsed = safeParseJson(result.text);
    if (parsed === null || typeof parsed !== 'object') return fallback;
    const obj = parsed as Record<string, unknown>;
    const followUpQuestion = asString(obj.followUpQuestion);
    const action =
      followUpAllowed && obj.action === 'follow_up' && followUpQuestion !== ''
        ? 'follow_up'
        : 'advance';
    return {
      action,
      acknowledgement: asString(obj.acknowledgement, fallback.acknowledgement),
      followUpQuestion: action === 'follow_up' ? followUpQuestion : '',
    };
  } catch (err) {
    console.error('[turn] decision failed, advancing:', err);
    return fallback;
  }
}
