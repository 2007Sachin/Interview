export type InterviewMode = 'resume' | 'capstone' | 'skill';

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
}

export type SessionStatus = 'active' | 'wrapup' | 'done';

export interface Session {
  id: string;
  createdAt: string;
  mode: InterviewMode;
  inputSummary: string;
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
