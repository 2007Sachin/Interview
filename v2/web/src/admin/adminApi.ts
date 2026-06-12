import type { InterviewSummary, ReadinessLevel, Report } from '../lib/api';

const BASE = import.meta.env.VITE_API_BASE ?? '';
const KEY_STORAGE = 'admin.key';

export function getAdminKey(): string {
  return sessionStorage.getItem(KEY_STORAGE) ?? '';
}

export function setAdminKey(key: string): void {
  sessionStorage.setItem(KEY_STORAGE, key);
}

export function clearAdminKey(): void {
  sessionStorage.removeItem(KEY_STORAGE);
}

export interface AdminOverview {
  totalStudents: number;
  activeStudentsThisWeek: number;
  interviewsThisWeek: number;
  interviewsPrevWeek: number;
  avgScoreThisWeek: number | null;
  avgScorePrevWeek: number | null;
  readinessNow: Record<ReadinessLevel, number>;
  readinessMonthAgo: Record<ReadinessLevel, number>;
  perDay: { day: string; count: number }[];
  hotTopics: { topicKey: string; topicLabel: string; attempts: number; avgScore: number | null }[];
  commonWeaknesses: { theme: string; students: number; pct: number }[];
}

export interface RosterRow {
  id: string;
  name: string;
  handle: string;
  institution: string;
  batch: string;
  interviews: number;
  latestReadiness: ReadinessLevel | null;
  latestScore: number | null;
  trend: -1 | 0 | 1;
  lastActive: string | null;
}

export interface AdminStudentDetail {
  student: {
    id: string;
    name: string;
    handle: string;
    institution: string;
    batch: string;
    createdAt: string;
  };
  interviews: InterviewSummary[];
}

async function adminFetch<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE}${path}${sep}key=${encodeURIComponent(getAdminKey())}`);
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as T;
}

export function fetchOverview(): Promise<AdminOverview> {
  return adminFetch('/api/admin/overview');
}

export function fetchRoster(q: string, batch: string): Promise<{ roster: RosterRow[] }> {
  return adminFetch(
    `/api/admin/roster?q=${encodeURIComponent(q)}&batch=${encodeURIComponent(batch)}`,
  );
}

export function fetchStudent(id: string): Promise<AdminStudentDetail> {
  return adminFetch(`/api/admin/student/${id}`);
}

export async function fetchSessionReport(id: string): Promise<Report | null> {
  const res = await fetch(`${BASE}/api/session/${id}/report`);
  if (!res.ok) return null;
  const body = (await res.json()) as { status: string; report?: Report };
  return body.status === 'ready' && body.report ? body.report : null;
}

export function rosterToCsv(rows: RosterRow[]): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = 'name,handle,batch,interviews,latest_readiness,latest_score,trend,last_active';
  const lines = rows.map((r) =>
    [
      esc(r.name),
      esc(r.handle),
      esc(r.batch),
      r.interviews,
      esc(r.latestReadiness),
      r.latestScore === null ? '' : Math.round(r.latestScore),
      r.trend === 1 ? 'rising' : r.trend === -1 ? 'dipping' : 'steady',
      esc(r.lastActive),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}
