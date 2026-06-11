import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '../types.js';
import type { SessionStore } from './SessionStore.js';

/**
 * Production store. One row per session in the `sessions` table; the full
 * session (brief, transcripts, report, cost log) lives in the `data` jsonb
 * column, with a few promoted columns for cheap admin queries.
 * Schema: see "Supabase table schema" in /v2/README.md.
 */
export class SupabaseSessionStore implements SessionStore {
  private client: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    if (!url || !serviceKey) {
      throw new Error('STORAGE_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SERVICE_KEY');
    }
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  private row(session: Session) {
    return {
      id: session.id,
      created_at: session.createdAt,
      mode: session.mode,
      status: session.status,
      report_status: session.reportStatus,
      cost_usd: session.costUsd,
      data: session,
    };
  }

  async create(session: Session): Promise<void> {
    const { error } = await this.client.from('sessions').insert(this.row(session));
    if (error) throw new Error(`supabase insert failed: ${error.message}`);
  }

  async get(id: string): Promise<Session | null> {
    const { data, error } = await this.client
      .from('sessions')
      .select('data')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`supabase select failed: ${error.message}`);
    return data ? (data.data as Session) : null;
  }

  async save(session: Session): Promise<void> {
    const { error } = await this.client.from('sessions').upsert(this.row(session));
    if (error) throw new Error(`supabase upsert failed: ${error.message}`);
  }

  async stats(): Promise<{ day: string; interviews: number; avgCostUsd: number }[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('created_at, cost_usd')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(`supabase stats failed: ${error.message}`);
    const byDay = new Map<string, { count: number; cost: number }>();
    for (const row of data ?? []) {
      const day = String(row.created_at).slice(0, 10);
      const entry = byDay.get(day) ?? { count: 0, cost: 0 };
      entry.count += 1;
      entry.cost += Number(row.cost_usd) || 0;
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
