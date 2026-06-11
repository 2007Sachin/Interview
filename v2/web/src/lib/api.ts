export type InterviewMode = 'resume' | 'capstone' | 'skill';

export interface Brief {
  title: string;
  summary: string;
  focusAreas: string[];
  questionBank: string[];
  rubric: string[];
}

export interface SessionView {
  id: string;
  mode: InterviewMode;
  status: 'active' | 'wrapup' | 'done';
  brief: Brief;
  interviewerName: string;
  currentPrompt: string;
  currentPromptIsFollowUp: boolean;
  questionIndex: number;
  total: number;
  lastTranscript: string;
  reportStatus: 'none' | 'generating' | 'ready' | 'failed';
}

export interface AnswerResponse {
  transcript: string;
  nextPrompt: string;
  isFollowUp: boolean;
  questionIndex: number;
  total: number;
  done: boolean;
  retry?: boolean;
}

export interface Report {
  overall: {
    score: number;
    readinessLevel: 'needs practice' | 'developing' | 'interview-ready';
    summary: string;
  };
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

export type ReportPoll =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'ready'; report: Report };

const BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export interface CreateSessionInput {
  mode: InterviewMode;
  skill?: string;
  level?: string;
  resumeText?: string;
  capstoneFile?: File;
}

export async function createSession(input: CreateSessionInput): Promise<SessionView> {
  if (input.mode === 'capstone' && input.capstoneFile) {
    const form = new FormData();
    form.append('mode', 'capstone');
    form.append('file', input.capstoneFile);
    return handle(await fetch(`${BASE}/api/session`, { method: 'POST', body: form }));
  }
  return handle(
    await fetch(`${BASE}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: input.mode,
        skill: input.skill,
        level: input.level,
        resumeText: input.resumeText,
      }),
    }),
  );
}

export async function getSession(id: string): Promise<SessionView> {
  return handle(await fetch(`${BASE}/api/session/${id}`));
}

export async function answerWithAudio(id: string, audio: Blob): Promise<AnswerResponse> {
  const form = new FormData();
  const ext = audio.type.includes('ogg') ? 'ogg' : audio.type.includes('mp4') ? 'mp4' : 'webm';
  form.append('audio', audio, `answer.${ext}`);
  return handle(
    await fetch(`${BASE}/api/session/${id}/answer`, { method: 'POST', body: form }),
  );
}

export async function answerWithText(id: string, text: string): Promise<AnswerResponse> {
  return handle(
    await fetch(`${BASE}/api/session/${id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
  );
}

export async function endSession(id: string): Promise<void> {
  await handle(await fetch(`${BASE}/api/session/${id}/end`, { method: 'POST' }));
}

export async function getReport(id: string): Promise<ReportPoll> {
  return handle(await fetch(`${BASE}/api/session/${id}/report`));
}

export async function retryReport(id: string): Promise<void> {
  await handle(await fetch(`${BASE}/api/session/${id}/report/retry`, { method: 'POST' }));
}
