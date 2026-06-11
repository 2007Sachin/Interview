import fs from 'node:fs/promises';
import path from 'node:path';
import type { Session } from '../types.js';
import type { SessionStore } from './SessionStore.js';

/**
 * Default store: one JSON file per session under DATA_DIR/sessions.
 * Zero setup, perfect for local development.
 */
export class FileSessionStore implements SessionStore {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'sessions');
  }

  private file(id: string): string {
    // Session ids are server-generated UUIDs; reject anything else so a
    // crafted id can never traverse paths.
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('invalid session id');
    return path.join(this.dir, `${id}.json`);
  }

  async create(session: Session): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await this.save(session);
  }

  async get(id: string): Promise<Session | null> {
    try {
      const raw = await fs.readFile(this.file(id), 'utf8');
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  }

  async save(session: Session): Promise<void> {
    const file = this.file(session.id);
    // Unique tmp name so concurrent saves of the same session never race on rename.
    const tmp = `${file}.${process.hrtime.bigint()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(session, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }

  async stats(): Promise<{ day: string; interviews: number; avgCostUsd: number }[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const byDay = new Map<string, { count: number; cost: number }>();
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.dir, f), 'utf8');
        const s = JSON.parse(raw) as Session;
        const day = s.createdAt.slice(0, 10);
        const entry = byDay.get(day) ?? { count: 0, cost: 0 };
        entry.count += 1;
        entry.cost += s.costUsd ?? 0;
        byDay.set(day, entry);
      } catch {
        // skip unreadable files
      }
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
