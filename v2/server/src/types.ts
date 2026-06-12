export type InterviewMode = 'resume' | 'capstone' | 'skill';

export type Difficulty = 'easy' | 'standard' | 'hard';

/** A drill is a 3-question mini-interview built only from past weaknesses. */
export type SessionKind = 'interview' | 'drill';

export interface Student {
  id: string;
  /** Email or college ID — whatever the student typed. Unique per store. */
  handle: string;
  name: string;
  createdAt: string;
  /** Derived from the handle's domain at signup; manual mapping can override. */
  institution: string;
  /** Batch/department — set via manual mapping for v1. */
  batch: string;
  /** Placement-office access. Manually settable; see README. */
  isAdmin: boolean;
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  mode: InterviewMode;
  kind: SessionKind;
  topicKey: string;
  topicLabel: string;
  difficulty: Difficulty;
  status: SessionStatus;
  score: number | null;
  readinessLevel: ReadinessLevel | null;
}

export interface Brief {
  title: string;
  summary: string;
  focusAreas: string[];
  questionBank: string[];
  rubric: string[];
}

export interface Turn {
  questionIndex: number;
  prompt: string;
  isFollowUp: boolean;
  transcript: string;
  source: 'audio' | 'text';
  answeredAt: string;
}

export interface CostLog {
  sttSeconds: number;
  fastInputTokens: number;
  fastOutputTokens: number;
  smartInputTokens: number;
  smartOutputTokens: number;
}

export type ReadinessLevel = 'needs practice' | 'developing' | 'interview-ready';

export interface Report {
  overall: { score: number; readinessLevel: ReadinessLevel; summary: string };
  highlights: string[];
  oneThingToFix: { title: string; why: string; how: string };
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  perQuestion: {
    question: string;
    answerSummary: string;
    score: number;
    feedback: string;
    howToImprove: string;
  }[];
  partial: boolean;
  /**
   * Coach-toned comparison with the previous attempt on this topic
   * ("Last time: rambling answers. This time: tighter. Fixed."). Null on a
   * first attempt.
   */
  progressNote: string | null;
}

export type SessionStatus = 'active' | 'wrapup' | 'done';

export interface Session {
  id: string;
  createdAt: string;
  mode: InterviewMode;
  kind: SessionKind;
  inputSummary: string;
  /** Normalized topic for grouping attempts (e.g. "sql", "resume"). */
  topicKey: string;
  difficulty: Difficulty;
  totalQuestions: number;
  studentId: string | null;
  brief: Brief;
  status: SessionStatus;
  currentQuestionIndex: number;
  followUpUsedForCurrent: boolean;
  currentPrompt: string;
  currentPromptIsFollowUp: boolean;
  turns: Turn[];
  report: Report | null;
  reportStatus: 'none' | 'generating' | 'ready' | 'failed';
  cost: CostLog;
  costUsd: number;
}

export interface AnswerResponse {
  transcript: string;
  nextPrompt: string;
  isFollowUp: boolean;
  questionIndex: number;
  total: number;
  done: boolean;
  /** Set when the answer was empty or inaudible; the question did not advance. */
  retry?: boolean;
}
