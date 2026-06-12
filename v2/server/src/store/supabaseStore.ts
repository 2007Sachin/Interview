import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Session, SessionSummary, Student } from '../types.js';
import { toSummary, type SessionStore } from './SessionStore.js';

/**
 * Production store. One row per session in `sessions` (full session in the
 * `data` jsonb column, key fields promoted for queries) and one row per
 * student in `users`. Schema: see "Supabase table schema" in /v2/README.md.
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
      kind: session.kind ?? 'interview',
      topic_key: session.topicKey ?? session.mode,
      difficulty: session.difficulty ?? 'standard',
      student_id: session.studentId,
      status: session.status,
      report_status: session.reportStatus,
      score: session.report?.overall.score ?? null,
      readiness: session.report?.overall.readinessLevel ?? null,
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

  async deleteSession(id: string, studentId: string | null): Promise<boolean> {
    let query = this.client.from('sessions').delete({ count: 'exact' }).eq('id', id);
    query = studentId === null ? query.is('student_id', null) : query.eq('student_id', studentId);
    const { error, count } = await query;
    if (error) throw new Error(`supabase delete failed: ${error.message}`);
    return (count ?? 0) > 0;
  }

  private toStudent(data: Record<string, unknown>): Student {
    return {
      id: String(data.id),
      handle: String(data.handle),
      name: String(data.name ?? ''),
      createdAt: String(data.created_at),
      institution: String(data.institution ?? ''),
      batch: String(data.batch ?? ''),
      isAdmin: Boolean(data.is_admin),
    };
  }

  async createStudent(student: Student): Promise<void> {
    const { error } = await this.client.from('users').insert({
      id: student.id,
      handle: student.handle,
      name: student.name,
      created_at: student.createdAt,
      institution: student.institution,
      batch: student.batch,
      is_admin: student.isAdmin,
    });
    if (error) throw new Error(`supabase user insert failed: ${error.message}`);
  }

  async getStudent(id: string): Promise<Student | null> {
    const { data, error } = await this.client.from('users').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`supabase user select failed: ${error.message}`);
    return data ? this.toStudent(data) : null;
  }

  async getStudentByHandle(handle: string): Promise<Student | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .ilike('handle', handle)
      .maybeSingle();
    if (error) throw new Error(`supabase user select failed: ${error.message}`);
    return data ? this.toStudent(data) : null;
  }

  async listStudents(): Promise<Student[]> {
    const { data, error } = await this.client.from('users').select('*').limit(2000);
    if (error) throw new Error(`supabase users list failed: ${error.message}`);
    return (data ?? []).map((d) => this.toStudent(d));
  }

  async listAllSessions(): Promise<Session[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('data')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(`supabase sessions list failed: ${error.message}`);
    return (data ?? []).map((r) => r.data as Session);
  }

  async listByStudent(studentId: string): Promise<SessionSummary[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('data')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(`supabase list failed: ${error.message}`);
    return (data ?? []).map((r) => toSummary(r.data as Session));
  }

  async listTopicSessions(studentId: string, topicKey: string): Promise<Session[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('data')
      .eq('student_id', studentId)
      .eq('topic_key', topicKey)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw new Error(`supabase topic list failed: ${error.message}`);
    return (data ?? []).map((r) => r.data as Session);
  }

  async deleteStudent(studentId: string): Promise<void> {
    // sessions cascade via FK, but delete explicitly so file/supabase behave
    // identically even if the FK is missing.
    const { error: sErr } = await this.client.from('sessions').delete().eq('student_id', studentId);
    if (sErr) throw new Error(`supabase cascade failed: ${sErr.message}`);
    const { error } = await this.client.from('users').delete().eq('id', studentId);
    if (error) throw new Error(`supabase user delete failed: ${error.message}`);
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
