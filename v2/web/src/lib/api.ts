import { getStudentId } from './student';

export type InterviewMode = 'resume' | 'capstone' | 'skill';

export type Difficulty = 'easy' | 'standard' | 'hard';

export type ReadinessLevel = 'needs practice' | 'developing' | 'interview-ready';

export interface Student {
  id: string;
  handle: string;
  name: string;
  createdAt: string;
  interviewsThisWeek?: number;
  totalInterviews?: number;
}

export interface InterviewSummary {
  id: string;
  createdAt: string;
  mode: InterviewMode;
  kind: 'interview' | 'drill';
  topicKey: string;
  topicLabel: string;
  difficulty: Difficulty;
  status: 'active' | 'wrapup' | 'done';
  score: number | null;
  readinessLevel: ReadinessLevel | null;
}

export interface TopicProgress {
  topicKey: string;
  topicLabel: string;
  attempts: {
    id: string;
    createdAt: string;
    difficulty: Difficulty;
    score: number;
    readinessLevel: ReadinessLevel;
    oneThingToFix: string;
    progressNote: string | null;
  }[];
}

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
  kind: 'interview' | 'drill';
  status: 'active' | 'wrapup' | 'done';
  brief: Brief;
  interviewerName: string;
  difficulty: Difficulty;
  topicKey: string;
  topicLabel: string;
  claimed: boolean;
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
    readinessLevel: ReadinessLevel;
    summary: string;
  };
  progressNote: string | null;
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

function authHeaders(): Record<string, string> {
  const id = getStudentId();
  return id ? { 'X-Student-Id': id } : {};
}

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
  difficulty?: Difficulty;
}

export async function createSession(input: CreateSessionInput): Promise<SessionView> {
  if (input.mode === 'capstone' && input.capstoneFile) {
    const form = new FormData();
    form.append('mode', 'capstone');
    form.append('difficulty', input.difficulty ?? 'standard');
    form.append('file', input.capstoneFile);
    return handle(
      await fetch(`${BASE}/api/session`, { method: 'POST', headers: authHeaders(), body: form }),
    );
  }
  return handle(
    await fetch(`${BASE}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        mode: input.mode,
        skill: input.skill,
        level: input.level,
        resumeText: input.resumeText,
        difficulty: input.difficulty ?? 'standard',
      }),
    }),
  );
}

/* ── Student identity & progress ───────────────────────────────────────── */

export async function createStudent(handleText: string, name: string): Promise<Student> {
  return handle(
    await fetch(`${BASE}/api/student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ handle: handleText, name }),
    }),
  );
}

export async function getMe(): Promise<Student> {
  return handle(await fetch(`${BASE}/api/student/me`, { headers: authHeaders() }));
}

export async function listInterviews(): Promise<InterviewSummary[]> {
  const res = await handle<{ interviews: InterviewSummary[] }>(
    await fetch(`${BASE}/api/student/interviews`, { headers: authHeaders() }),
  );
  return res.interviews;
}

export async function getProgress(topicKey: string): Promise<TopicProgress> {
  return handle(
    await fetch(`${BASE}/api/student/progress?topic=${encodeURIComponent(topicKey)}`, {
      headers: authHeaders(),
    }),
  );
}

export async function claimSession(id: string): Promise<void> {
  await handle(
    await fetch(`${BASE}/api/session/${id}/claim`, { method: 'POST', headers: authHeaders() }),
  );
}

export async function createDrill(): Promise<SessionView> {
  return handle(
    await fetch(`${BASE}/api/student/drill`, { method: 'POST', headers: authHeaders() }),
  );
}

export async function deleteInterview(id: string): Promise<void> {
  await handle(
    await fetch(`${BASE}/api/session/${id}`, { method: 'DELETE', headers: authHeaders() }),
  );
}

export async function deleteAccount(): Promise<void> {
  await handle(
    await fetch(`${BASE}/api/student/me`, { method: 'DELETE', headers: authHeaders() }),
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
