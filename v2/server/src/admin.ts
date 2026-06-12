import type { ReadinessLevel, Session, Student } from './types.js';

/**
 * Placement-office aggregates, computed in Node from the store so the file
 * and Supabase backends behave identically. Read-only, pattern-level — the
 * framing is developmental ("progress"), never a ranking.
 */

const DAY = 24 * 3600 * 1000;
const READINESS: ReadinessLevel[] = ['needs practice', 'developing', 'interview-ready'];

/** Coarse, anonymized weakness themes — keyword bucketing, no extra LLM cost. */
const WEAKNESS_THEMES: { theme: string; pattern: RegExp }[] = [
  { theme: 'Using concrete examples and evidence', pattern: /example|specific|evidence|detail|quantif|metric|anecdote/i },
  { theme: 'Concise, structured answers', pattern: /ramb|concise|structur|too long|focus|organis|organiz|brevity|tangent|wordy/i },
  { theme: 'Explaining projects clearly', pattern: /project|explain|walk.?through|describ|articulat|clarity|clear|communicat/i },
  { theme: 'Technical depth and fundamentals', pattern: /depth|technical|fundamental|concept|knowledge|accurac|theory/i },
  { theme: 'Confidence and delivery', pattern: /confiden|nervous|hesit|filler|pace|delivery|energy|mumbl/i },
];

export interface AdminOverview {
  totalStudents: number;
  activeStudentsThisWeek: number;
  interviewsThisWeek: number;
  interviewsPrevWeek: number;
  avgScoreThisWeek: number | null;
  avgScorePrevWeek: number | null;
  /** Latest readiness per student, today vs ~30 days ago. */
  readinessNow: Record<ReadinessLevel, number>;
  readinessMonthAgo: Record<ReadinessLevel, number>;
  /** Interviews per day, oldest first, last 30 days. */
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
  /** -1 falling, 0 flat/unknown, 1 rising — last two scored attempts. */
  trend: -1 | 0 | 1;
  lastActive: string | null;
}

function emptyReadiness(): Record<ReadinessLevel, number> {
  return { 'needs practice': 0, developing: 0, 'interview-ready': 0 };
}

function latestReadinessPerStudent(
  sessions: Session[],
  before: number,
): Record<ReadinessLevel, number> {
  const latest = new Map<string, { at: number; level: ReadinessLevel }>();
  for (const s of sessions) {
    const at = Date.parse(s.createdAt);
    const level = s.report?.overall.readinessLevel;
    if (!s.studentId || !level || at > before) continue;
    const current = latest.get(s.studentId);
    if (!current || at > current.at) latest.set(s.studentId, { at, level });
  }
  const dist = emptyReadiness();
  for (const { level } of latest.values()) dist[level] += 1;
  return dist;
}

function avgScore(sessions: Session[]): number | null {
  const scores = sessions
    .map((s) => s.report?.overall.score)
    .filter((v): v is number => typeof v === 'number');
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

export function buildOverview(students: Student[], sessions: Session[]): AdminOverview {
  const now = Date.now();
  const weekAgo = now - 7 * DAY;
  const twoWeeksAgo = now - 14 * DAY;
  const monthAgo = now - 30 * DAY;

  const thisWeek = sessions.filter((s) => Date.parse(s.createdAt) >= weekAgo);
  const prevWeek = sessions.filter((s) => {
    const t = Date.parse(s.createdAt);
    return t >= twoWeeksAgo && t < weekAgo;
  });

  const perDayMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    perDayMap.set(new Date(now - i * DAY).toISOString().slice(0, 10), 0);
  }
  for (const s of sessions) {
    const day = s.createdAt.slice(0, 10);
    if (perDayMap.has(day)) perDayMap.set(day, (perDayMap.get(day) ?? 0) + 1);
  }

  const topics = new Map<string, { label: string; scores: number[]; attempts: number }>();
  for (const s of sessions) {
    if ((s.kind ?? 'interview') === 'drill') continue;
    const key = s.topicKey ?? s.mode;
    const entry = topics.get(key) ?? { label: s.inputSummary, scores: [], attempts: 0 };
    entry.attempts += 1;
    entry.label = s.inputSummary;
    const score = s.report?.overall.score;
    if (typeof score === 'number') entry.scores.push(score);
    topics.set(key, entry);
  }
  const hotTopics = [...topics.entries()]
    .sort((a, b) => b[1].attempts - a[1].attempts)
    .slice(0, 8)
    .map(([topicKey, t]) => ({
      topicKey,
      topicLabel: t.label,
      attempts: t.attempts,
      avgScore: t.scores.length
        ? Math.round((t.scores.reduce((a, b) => a + b, 0) / t.scores.length) * 10) / 10
        : null,
    }));

  // Weakness themes: which students show each theme at least once.
  const themeStudents = new Map<string, Set<string>>();
  const studentsWithReports = new Set<string>();
  for (const s of sessions) {
    if (!s.studentId || !s.report) continue;
    studentsWithReports.add(s.studentId);
    const texts = [
      s.report.oneThingToFix.title,
      s.report.oneThingToFix.why,
      ...s.report.swot.weaknesses,
    ].join(' ');
    for (const { theme, pattern } of WEAKNESS_THEMES) {
      if (pattern.test(texts)) {
        const set = themeStudents.get(theme) ?? new Set<string>();
        set.add(s.studentId);
        themeStudents.set(theme, set);
      }
    }
  }
  const reportTotal = studentsWithReports.size;
  const commonWeaknesses = [...themeStudents.entries()]
    .map(([theme, set]) => ({
      theme,
      students: set.size,
      pct: reportTotal ? Math.round((set.size / reportTotal) * 100) : 0,
    }))
    .sort((a, b) => b.students - a.students);

  const activeStudents = new Set(
    thisWeek.map((s) => s.studentId).filter((id): id is string => !!id),
  );

  return {
    totalStudents: students.filter((s) => !s.isAdmin).length,
    activeStudentsThisWeek: activeStudents.size,
    interviewsThisWeek: thisWeek.length,
    interviewsPrevWeek: prevWeek.length,
    avgScoreThisWeek: avgScore(thisWeek),
    avgScorePrevWeek: avgScore(prevWeek),
    readinessNow: latestReadinessPerStudent(sessions, now),
    readinessMonthAgo: latestReadinessPerStudent(sessions, monthAgo),
    perDay: [...perDayMap.entries()].map(([day, count]) => ({ day, count })),
    hotTopics,
    commonWeaknesses,
  };
}

export function buildRoster(students: Student[], sessions: Session[]): RosterRow[] {
  const byStudent = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!s.studentId) continue;
    const list = byStudent.get(s.studentId) ?? [];
    list.push(s);
    byStudent.set(s.studentId, list);
  }

  return students
    .filter((s) => !s.isAdmin)
    .map((student) => {
      const own = (byStudent.get(student.id) ?? []).sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : 1,
      );
      const scored = own.filter((s) => typeof s.report?.overall.score === 'number');
      const latest = scored.at(-1);
      const previous = scored.at(-2);
      let trend: -1 | 0 | 1 = 0;
      if (latest && previous) {
        const diff = (latest.report?.overall.score ?? 0) - (previous.report?.overall.score ?? 0);
        trend = diff > 2 ? 1 : diff < -2 ? -1 : 0;
      }
      return {
        id: student.id,
        name: student.name,
        handle: student.handle,
        institution: student.institution ?? '',
        batch: student.batch ?? '',
        interviews: own.length,
        latestReadiness: latest?.report?.overall.readinessLevel ?? null,
        latestScore: latest?.report?.overall.score ?? null,
        trend,
        lastActive: own.at(-1)?.createdAt ?? null,
      };
    })
    .sort((a, b) => ((a.lastActive ?? '') < (b.lastActive ?? '') ? 1 : -1));
}

export { READINESS };
