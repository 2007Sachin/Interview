import { config } from '../config.js';
import type { GroqClient } from './groq.js';
import { safeParseJson, asString, asStringArray } from './safeJson.js';
import type { Brief, CostLog, InterviewMode } from '../types.js';

const MODE_CONTEXT: Record<InterviewMode, string> = {
  skill: 'a skill-based interview. The material below names the skill and the student\'s self-rated level.',
  resume: 'a resume walkthrough interview. The material below is the student\'s resume.',
  capstone: 'a capstone/project defense interview. The material below is extracted from the student\'s capstone document.',
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
  return {
    title: `Practice interview: ${label}`,
    summary: `A short practice interview focused on ${label}. We'll keep it conversational — this is practice, not a test.`,
    focusAreas: ['Communication', 'Depth of understanding', 'Concrete examples'],
    questionBank: generic.slice(0, total),
    rubric: [
      'Clarity and structure of answers',
      'Use of specific, concrete examples',
      'Depth of understanding',
      'Self-awareness and growth mindset',
    ],
  };
}

export async function generateBrief(
  groq: GroqClient,
  cost: CostLog,
  mode: InterviewMode,
  material: string,
  label: string,
): Promise<Brief> {
  const total = config.totalQuestions;
  const prompt = `You are designing ${MODE_CONTEXT[mode]}

STUDENT MATERIAL:
${material}

Create an interview brief as JSON with exactly these keys:
{
  "title": "short interview title",
  "summary": "2-3 warm sentences describing what this interview covers, addressed to the student",
  "focusAreas": ["3-5 areas the interview probes"],
  "questionBank": [exactly ${total} interview questions as strings, ordered easy/warm-up first to harder later, each answerable by speaking for 30-60 seconds],
  "rubric": ["4-6 criteria a coach would assess answers against"]
}

Rules: questions must be specific to the student material where possible. Friendly, encouraging coach tone. Plain spoken English (the questions are read aloud). Output ONLY the JSON object.`;

  let parsed: unknown = null;
  try {
    const result = await groq.chat(
      config.modelSmart,
      [{ role: 'user', content: prompt }],
      { json: true },
    );
    cost.smartInputTokens += result.usage.inputTokens;
    cost.smartOutputTokens += result.usage.outputTokens;
    parsed = safeParseJson(result.text);
  } catch (err) {
    console.error('[brief] generation failed, using fallback:', err);
  }

  const fallback = fallbackBrief(label, total);
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
