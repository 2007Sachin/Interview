import type { Session } from '../types.js';

export interface SessionStore {
  create(session: Session): Promise<void>;
  get(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** Lightweight stats for the admin peek: sessions per day and average cost. */
  stats(): Promise<{ day: string; interviews: number; avgCostUsd: number }[]>;
}
