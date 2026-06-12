import { config } from '../config.js';
import type { GroqClient } from './groq.js';
import { safeParseJson, asString, asStringArray } from './safeJson.js';
import type { Brief, CostLog, Difficulty, InterviewMode } from '../types.js';

const MODE_CONTEXT: Record<InterviewMode, string> = {
  skill: 'a skill-based interview. The material below names the skill and the student\'s self-rated level.',
  resume: 'a resume walkthrough interview. The material below is the student\'s resume.',
  capstone: 'a capstone/project defense interview. The material below is extracted from the student\'s capstone document.',
};

const DIFFICULTY_BRIEF: Record<Difficulty, string> = {
  easy: 'Difficulty: EASY — warm-up depth. Friendly fundamentals, definitions, "tell me about" questions. No trick questions, no multi-part questions.',
  standard: 'Difficulty: STANDARD — typical entry-level interview depth. Mix fundamentals with applied "how would you" scenarios.',
  hard: 'Difficulty: HARD — demanding interview depth. Applied scenarios, trade-offs, "why not the alternative", edge cases. Still fair and answerable by speaking for a minute.',
};

function fallbackBrief(label: string, total: number): Brief {
  const generic = [
    `Tell me about yourself and what drew you to ${label}.`,
    `Walk me through something you've built or worked on related to ${label}.`,
    `What part of ${label} do you feel strongest in, and why?`,
    `Describe a problem you got stuck on and how you worked through it.`,
    `How would you explain a core concept of ${label} to someone new to it?`,
    `Tell me about a time you received feedback and what you did with it.`,
    `Where do you want to grow next in ${label}?`,
    `Why should a team trust you with real work in ${label}?`,
  ];
  const bank: string[] = [];
  while (bank.length < total) bank.push(...generic.slice(0, total - bank.length));
  return {
    title: `Practice interview: ${label}`,
    summary: `A short practice interview focused on ${label}. We'll keep it conversational — this is practice, not a test.`,
    focusAreas: ['Communication', 'Depth of understanding', 'Concrete examples'],
    questionBank: bank,
    rubric: [
      'Clarity and structure of answers',
      'Use of specific, concrete examples',
      'Depth of understanding',
      'Self-awareness and growth mindset',
    ],
  };
}

export interface BriefOptions {
  difficulty: Difficulty;
  total: number;
  /** Questions this student already got on this topic — never repeat them. */
  excludeQuestions: string[];
}

function coerceBrief(parsed: unknown, fallback: Brief, total: number): Brief {
  if (parsed === null || typeof parsed !== 'object') return fallback;
  const obj = parsed as Record<string, unknown>;
  const questions = asStringArray(obj.questionBank, total);
  return {
    title: asString(obj.title, fallback.title),
    summary: asString(obj.summary, fallback.summary),
    focusAreas: asStringArray(obj.focusAreas, 5).length
      ? asStringArray(obj.focusAreas, 5)
      : fallback.focusAreas,
    questionBank:
      questions.length === total
        ? questions
        : [...questions, ...fallback.questionBank].slice(0, total),
    rubric: asStringArray(obj.rubric, 6).length ? asStringArray(obj.rubric, 6) : fallback.rubric,
  };
}

async function runBriefPrompt(
  groq: GroqClient,
  cost: CostLog,
  prompt: string,
  fallback: Brief,
  total: number,
): Promise<Brief> {
  let parsed: unknown = null;
  try {
    const result = await groq.chat(config.modelSmart, [{ role: 'user', content: prompt }], {
      json: true,
    });
    cost.smartInputTokens += result.usage.inputTokens;
    cost.smartOutputTokens += result.usage.outputTokens;
    parsed = safeParseJson(result.text);
  } catch (err) {
    console.error('[brief] generation failed, using fallback:', err);
  }
  return coerceBrief(parsed, fallback, total);
}

export async function generateBrief(
  groq: GroqClient,
  cost: CostLog,
  mode: InterviewMode,
  material: string,
  label: string,
  opts: BriefOptions,
): Promise<Brief> {
  const { difficulty, total, excludeQuestions } = opts;
  const exclusions = excludeQuestions.length
    ? `\nThe student has ALREADY been asked these questions in earlier attempts — do NOT repeat them or close paraphrases of them:\n${excludeQuestions.map((q) => `- ${q}`).join('\n')}\n`
    : '';
  const prompt = `You are designing ${MODE_CONTEXT[mode]}

STUDENT MATERIAL:
${material}

${DIFFICULTY_BRIEF[difficulty]}
${exclusions}
Create an interview brief as JSON with exactly these keys:
{
  "title": "short interview title",
  "summary": "2-3 warm sentences describing what this interview covers, addressed to the student",
  "focusAreas": ["3-5 areas the interview probes"],
  "questionBank": [exactly ${total} interview questions as strings, ordered easy/warm-up first to harder later, each answerable by speaking for 30-60 seconds],
  "rubric": ["4-6 criteria a coach would assess answers against"]
}

Rules: questions must be specific to the student material where possible. Friendly, encouraging coach tone. Plain spoken English (the questions are read aloud). Output ONLY the JSON object.`;

  return runBriefPrompt(groq, cost, prompt, fallbackBrief(label, total), total);
}

/**
 * Weak-spot drill: a short mini-interview generated ONLY from the student's
 * accumulated weaknesses and one-thing-to-fix history.
 */
export async function generateDrillBrief(
  groq: GroqClient,
  cost: CostLog,
  weaknessHistory: string,
  opts: BriefOptions,
): Promise<Brief> {
  const { total, excludeQuestions } = opts;
  const exclusions = excludeQuestions.length
    ? `\nDo NOT repeat these previously asked questions or close paraphrases:\n${excludeQuestions.map((q) => `- ${q}`).join('\n')}\n`
    : '';
  const prompt = `You are a warm interview coach designing a focused "weak spot drill" — a ${total}-question mini-interview that targets ONLY the specific weaknesses this student has shown across past practice interviews.

THE STUDENT'S ACCUMULATED WEAK SPOTS (from their past coaching reports):
${weaknessHistory}
${exclusions}
Create the drill brief as JSON with exactly these keys:
{
  "title": "short drill title naming the weak spots, e.g. 'Drill: concrete examples & structure'",
  "summary": "2-3 encouraging sentences telling the student exactly which weak spots this drill attacks and why a short focused rep works",
  "focusAreas": ["the 2-3 weak spots being drilled"],
  "questionBank": [exactly ${total} questions, each deliberately constructed so answering it WELL requires overcoming one of the listed weak spots],
  "rubric": ["3-5 criteria tied directly to the weak spots"]
}

Coach tone — this drill is a gift, not a punishment. Plain spoken English. Output ONLY the JSON object.`;

  const fallback = fallbackBrief('your weak spots', total);
  fallback.title = 'Weak spot drill';
  fallback.summary =
    'A short focused round built from what tripped you up before. Three good reps here move the needle more than another full interview.';
  return runBriefPrompt(groq, cost, prompt, fallback, total);
}
