import type { Session, SessionSummary, Student } from '../types.js';

export interface SessionStore {
  create(session: Session): Promise<void>;
  get(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** Remove one interview. Only deletes when ownership matches. */
  deleteSession(id: string, studentId: string | null): Promise<boolean>;

  /* ── Student identity & history ─────────────────────────────────────── */
  createStudent(student: Student): Promise<void>;
  getStudent(id: string): Promise<Student | null>;
  getStudentByHandle(handle: string): Promise<Student | null>;
  /** All sessions belonging to a student, newest first. */
  listByStudent(studentId: string): Promise<SessionSummary[]>;
  /** Full sessions for one student+topic, oldest first (for progress/exclusions). */
  listTopicSessions(studentId: string, topicKey: string): Promise<Session[]>;
  /** Delete the student and every session they own. */
  deleteStudent(studentId: string): Promise<void>;

  /* ── Admin (read-only aggregates are computed in Node from these) ─────── */
  listStudents(): Promise<Student[]>;
  /** Every stored session (capped); enough for v1 dashboard aggregation. */
  listAllSessions(): Promise<Session[]>;

  /** Lightweight stats for the admin peek: sessions per day and average cost. */
  stats(): Promise<{ day: string; interviews: number; avgCostUsd: number }[]>;
}

export function toSummary(s: Session): SessionSummary {
  return {
    id: s.id,
    createdAt: s.createdAt,
    mode: s.mode,
    kind: s.kind ?? 'interview',
    topicKey: s.topicKey ?? s.mode,
    topicLabel: s.inputSummary,
    difficulty: s.difficulty ?? 'standard',
    status: s.status,
    score: s.report?.overall.score ?? null,
    readinessLevel: s.report?.overall.readinessLevel ?? null,
  };
}
