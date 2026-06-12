import fs from 'node:fs/promises';
import path from 'node:path';
import type { Session, SessionSummary, Student } from '../types.js';
import { toSummary, type SessionStore } from './SessionStore.js';

/**
 * Default store: one JSON file per session under DATA_DIR/sessions and one
 * per student under DATA_DIR/students. Zero setup, perfect for local dev.
 * History queries scan the sessions directory — fine at local scale.
 */
export class FileSessionStore implements SessionStore {
  private dir: string;
  private studentsDir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'sessions');
    this.studentsDir = path.join(dataDir, 'students');
  }

  private file(base: string, id: string): string {
    // Ids are server-generated UUIDs; reject anything else so a crafted id
    // can never traverse paths.
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('invalid id');
    return path.join(base, `${id}.json`);
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Unique tmp name so concurrent saves never race on rename.
    const tmp = `${file}.${process.hrtime.bigint()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }

  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  private async allSessions(): Promise<Session[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const sessions: Session[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const s = await this.readJson<Session>(path.join(this.dir, f));
      if (s) sessions.push(s);
    }
    return sessions;
  }

  async create(session: Session): Promise<void> {
    await this.save(session);
  }

  async get(id: string): Promise<Session | null> {
    return this.readJson<Session>(this.file(this.dir, id));
  }

  async save(session: Session): Promise<void> {
    await this.writeJson(this.file(this.dir, session.id), session);
  }

  async deleteSession(id: string, studentId: string | null): Promise<boolean> {
    const session = await this.get(id);
    if (!session) return false;
    if ((session.studentId ?? null) !== studentId) return false;
    await fs.rm(this.file(this.dir, id), { force: true });
    return true;
  }

  async createStudent(student: Student): Promise<void> {
    await this.writeJson(this.file(this.studentsDir, student.id), student);
  }

  async getStudent(id: string): Promise<Student | null> {
    return this.readJson<Student>(this.file(this.studentsDir, id));
  }

  async getStudentByHandle(handle: string): Promise<Student | null> {
    let files: string[];
    try {
      files = await fs.readdir(this.studentsDir);
    } catch {
      return null;
    }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const s = await this.readJson<Student>(path.join(this.studentsDir, f));
      if (s && s.handle.toLowerCase() === handle.toLowerCase()) return s;
    }
    return null;
  }

  async listByStudent(studentId: string): Promise<SessionSummary[]> {
    const sessions = (await this.allSessions()).filter((s) => s.studentId === studentId);
    sessions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return sessions.map(toSummary);
  }

  async listTopicSessions(studentId: string, topicKey: string): Promise<Session[]> {
    const sessions = (await this.allSessions()).filter(
      (s) => s.studentId === studentId && (s.topicKey ?? s.mode) === topicKey,
    );
    sessions.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return sessions;
  }

  async deleteStudent(studentId: string): Promise<void> {
    const sessions = (await this.allSessions()).filter((s) => s.studentId === studentId);
    for (const s of sessions) {
      await fs.rm(this.file(this.dir, s.id), { force: true });
    }
    await fs.rm(this.file(this.studentsDir, studentId), { force: true });
  }

  async stats(): Promise<{ day: string; interviews: number; avgCostUsd: number }[]> {
    const byDay = new Map<string, { count: number; cost: number }>();
    for (const s of await this.allSessions()) {
      const day = s.createdAt.slice(0, 10);
      const entry = byDay.get(day) ?? { count: 0, cost: 0 };
      entry.count += 1;
      entry.cost += s.costUsd ?? 0;
      byDay.set(day, entry);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, { count, cost }]) => ({
        day,
        interviews: count,
        avgCostUsd: count ? Math.round((cost / count) * 1e6) / 1e6 : 0,
      }));
  }
}
