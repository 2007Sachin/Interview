import { randomUUID } from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { InterviewEngine } from './engine.js';
import type { GroqClient } from './llm/groq.js';
import { sanitizeForPrompt } from './sanitize.js';
import type { SessionStore } from './store/SessionStore.js';
import type { Difficulty, InterviewMode, Session, Student } from './types.js';

const MODES: InterviewMode[] = ['resume', 'capstone', 'skill'];
const DIFFICULTIES: Difficulty[] = ['easy', 'standard', 'hard'];

function publicSession(session: Session) {
  return {
    id: session.id,
    mode: session.mode,
    kind: session.kind ?? 'interview',
    status: session.status,
    brief: session.brief,
    interviewerName: config.interviewerName,
    difficulty: session.difficulty ?? 'standard',
    topicKey: session.topicKey ?? session.mode,
    topicLabel: session.inputSummary,
    claimed: session.studentId !== null,
    currentPrompt: session.currentPrompt,
    currentPromptIsFollowUp: session.currentPromptIsFollowUp,
    questionIndex: session.currentQuestionIndex,
    total: session.totalQuestions ?? config.totalQuestions,
    lastTranscript: session.turns.at(-1)?.transcript ?? '',
    reportStatus: session.reportStatus,
  };
}

export function createApp(store: SessionStore, groq: GroqClient): express.Express {
  const app = express();
  const engine = new InterviewEngine(store, groq);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.max(config.maxAudioBytes, config.maxPdfBytes) },
  });

  app.use(express.json({ limit: '1mb' }));

  if (config.frontendOrigin) {
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', config.frontendOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Student-Id');
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  /** The student identified by the X-Student-Id header, or null. */
  async function studentFrom(req: express.Request): Promise<Student | null> {
    const id = req.header('x-student-id');
    if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) return null;
    try {
      return await store.getStudent(id);
    } catch {
      return null;
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, interviewerName: config.interviewerName });
  });

  // Create a session. Accepts JSON (skill/resume modes) or multipart with a
  // PDF file (capstone mode). First interview stays signup-free.
  app.post('/api/session', upload.single('file'), async (req, res) => {
    try {
      const body = req.body as Record<string, string | undefined>;
      const mode = body.mode as InterviewMode | undefined;
      if (!mode || !MODES.includes(mode)) {
        res.status(400).json({ error: 'mode must be one of resume, capstone, skill' });
        return;
      }
      const difficulty = DIFFICULTIES.includes(body.difficulty as Difficulty)
        ? (body.difficulty as Difficulty)
        : 'standard';
      const student = await studentFrom(req);

      let material = '';
      let label = '';
      if (mode === 'skill') {
        const skill = sanitizeForPrompt(body.skill ?? '', 200);
        const level = sanitizeForPrompt(body.level ?? 'beginner', 50);
        if (!skill) {
          res.status(400).json({ error: 'skill is required' });
          return;
        }
        material = `Skill: ${skill}\nSelf-rated level: ${level}`;
        label = skill;
      } else if (mode === 'resume') {
        const resumeText = sanitizeForPrompt(body.resumeText ?? '');
        if (!resumeText) {
          res.status(400).json({ error: 'resumeText is required' });
          return;
        }
        material = resumeText;
        label = 'your resume';
      } else {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'a PDF file is required for capstone mode' });
          return;
        }
        if (file.size > config.maxPdfBytes) {
          res.status(413).json({ error: 'PDF too large (max 10 MB)' });
          return;
        }
        // pdf-parse's package entry runs debug code when imported directly;
        // import the library file instead (long-standing upstream quirk).
        const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
        const parsed = await pdfParse(file.buffer);
        material = sanitizeForPrompt(parsed.text);
        if (!material) {
          res.status(400).json({ error: 'could not extract any text from that PDF' });
          return;
        }
        label = 'your capstone project';
      }

      const session = await engine.createSession({
        mode,
        material,
        label,
        difficulty,
        studentId: student?.id ?? null,
      });
      res.json(publicSession(session));
    } catch (err) {
      console.error('[api] create session failed:', err);
      res.status(502).json({ error: 'Could not set up the interview. Give it a second and try again.' });
    }
  });

  app.get('/api/session/:id', async (req, res) => {
    const session = await engine.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    res.json(publicSession(session));
  });

  // Answer the current prompt: multipart audio clip OR JSON { text }.
  app.post('/api/session/:id/answer', upload.single('audio'), async (req, res) => {
    try {
      const session = await engine.getSession(String(req.params.id));
      if (!session) {
        res.status(404).json({ error: 'session not found' });
        return;
      }

      let transcript: string;
      let source: 'audio' | 'text';
      if (req.file) {
        if (req.file.size > config.maxAudioBytes) {
          res.status(413).json({ error: 'audio clip too large' });
          return;
        }
        transcript = await engine.transcribe(
          session,
          req.file.buffer,
          req.file.mimetype || 'audio/webm',
        );
        source = 'audio';
      } else {
        const body = req.body as Record<string, unknown>;
        transcript = typeof body.text === 'string' ? body.text : '';
        source = 'text';
        if (!transcript.trim()) {
          res.status(400).json({ error: 'send an audio file or a text answer' });
          return;
        }
      }

      const result = await engine.submitAnswer(session, transcript, source);
      res.json(result);
    } catch (err) {
      console.error('[api] answer failed:', err);
      res.status(502).json({ error: 'That one did not go through. Give it a second and try again.' });
    }
  });

  app.post('/api/session/:id/end', async (req, res) => {
    const session = await engine.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    await engine.endSession(session.id);
    res.json({ ok: true });
  });

  app.get('/api/session/:id/report', async (req, res) => {
    const session = await engine.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    if (session.report && session.reportStatus === 'ready') {
      res.json({ status: 'ready', report: session.report });
      return;
    }
    if (session.reportStatus === 'failed') {
      // Let the client trigger one more attempt.
      res.json({ status: 'failed' });
      return;
    }
    if (session.reportStatus === 'none' && session.status !== 'active') {
      engine.startReport(session.id);
    }
    res.json({ status: 'pending' });
  });

  app.post('/api/session/:id/report/retry', async (req, res) => {
    const session = await engine.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    if (session.reportStatus === 'failed') {
      session.reportStatus = 'none';
      await store.save(session);
      engine.startReport(session.id);
    }
    res.json({ ok: true });
  });

  /* ── Student identity & progress ──────────────────────────────────────── */

  // "Save your progress": lightweight identity by email or college ID.
  // Same-browser continuation; see README for the Supabase-OTP upgrade path.
  app.post('/api/student', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const handle = sanitizeForPrompt(typeof body.handle === 'string' ? body.handle : '', 120);
      const name = sanitizeForPrompt(typeof body.name === 'string' ? body.name : '', 80);
      if (!handle) {
        res.status(400).json({ error: 'enter your email or college ID' });
        return;
      }
      const existing = await store.getStudentByHandle(handle);
      if (existing) {
        const current = await studentFrom(req);
        if (current?.id === existing.id) {
          res.json(existing);
          return;
        }
        res.status(409).json({
          error:
            "That email/ID is already saving progress on another device. For now, progress lives in the browser where you practice — use a different ID here.",
        });
        return;
      }
      const student: Student = {
        id: randomUUID(),
        handle,
        name,
        createdAt: new Date().toISOString(),
        // v1 mapping: institution from the email/ID domain; batch is set
        // manually by the placement office (see README).
        institution: handle.includes('@')
          ? (handle.split('@')[1] ?? '').toLowerCase()
          : 'campus',
        batch: '',
        isAdmin: false,
      };
      await store.createStudent(student);
      res.json(student);
    } catch (err) {
      console.error('[api] create student failed:', err);
      res.status(502).json({ error: 'Could not save your progress just now — try again.' });
    }
  });

  // Profile + streak ("3 interviews this week" — coach-toned, never compared).
  app.get('/api/student/me', async (req, res) => {
    const student = await studentFrom(req);
    if (!student) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }
    const interviews = await store.listByStudent(student.id);
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const thisWeek = interviews.filter((s) => Date.parse(s.createdAt) >= weekAgo).length;
    res.json({ ...student, interviewsThisWeek: thisWeek, totalInterviews: interviews.length });
  });

  app.get('/api/student/interviews', async (req, res) => {
    const student = await studentFrom(req);
    if (!student) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }
    res.json({ interviews: await store.listByStudent(student.id) });
  });

  // Per-topic progress: score trend, readiness journey, what changed.
  app.get('/api/student/progress', async (req, res) => {
    const student = await studentFrom(req);
    if (!student) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }
    const topicKey = String(req.query.topic ?? '');
    if (!topicKey) {
      res.status(400).json({ error: 'topic is required' });
      return;
    }
    const sessions = (await store.listTopicSessions(student.id, topicKey)).filter(
      (s) => s.report !== null,
    );
    res.json({
      topicKey,
      topicLabel: sessions.at(-1)?.inputSummary ?? topicKey,
      attempts: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        difficulty: s.difficulty ?? 'standard',
        score: s.report?.overall.score ?? 0,
        readinessLevel: s.report?.overall.readinessLevel ?? 'developing',
        oneThingToFix: s.report?.oneThingToFix.title ?? '',
        progressNote: s.report?.progressNote ?? null,
      })),
    });
  });

  // Attach an anonymous session to a student ("save your progress" post-interview).
  app.post('/api/session/:id/claim', async (req, res) => {
    const student = await studentFrom(req);
    if (!student) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }
    const session = await engine.getSession(String(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    if (session.studentId && session.studentId !== student.id) {
      res.status(403).json({ error: 'this interview belongs to someone else' });
      return;
    }
    session.studentId = student.id;
    await store.save(session);
    res.json({ ok: true });
  });

  // Weak-spot drill: 3 questions from accumulated weaknesses.
  app.post('/api/student/drill', async (req, res) => {
    try {
      const student = await studentFrom(req);
      if (!student) {
        res.status(401).json({ error: 'not signed in' });
        return;
      }
      const session = await engine.createDrill(student.id);
      if (!session) {
        res.status(400).json({
          error: 'Finish one full interview first — the drill is built from your reports.',
        });
        return;
      }
      res.json(publicSession(session));
    } catch (err) {
      console.error('[api] drill failed:', err);
      res.status(502).json({ error: 'Could not build your drill. Give it a second and try again.' });
    }
  });

  /* ── Privacy: students can delete an interview or their whole account ──── */

  app.delete('/api/session/:id', async (req, res) => {
    const student = await studentFrom(req);
    const deleted = await store.deleteSession(String(req.params.id), student?.id ?? null);
    if (!deleted) {
      res.status(404).json({ error: 'interview not found (or not yours to delete)' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/student/me', async (req, res) => {
    const student = await studentFrom(req);
    if (!student) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }
    await store.deleteStudent(student.id);
    res.json({ ok: true });
  });

  /* ── Institution admin (read-only). Access: ADMIN_KEY or an isAdmin user. ─ */

  async function isAdminReq(req: express.Request): Promise<boolean> {
    if (
      config.adminKey &&
      (req.query.key === config.adminKey || req.header('x-admin-key') === config.adminKey)
    ) {
      return true;
    }
    const student = await studentFrom(req);
    return student?.isAdmin === true;
  }

  function adminGuard(
    handler: (req: express.Request, res: express.Response) => Promise<void>,
  ): express.RequestHandler {
    return async (req, res) => {
      if (!(await isAdminReq(req))) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      try {
        await handler(req, res);
      } catch (err) {
        console.error('[api] admin route failed:', err);
        res.status(502).json({ error: 'could not load that just now — try again' });
      }
    };
  }

  app.get(
    '/api/admin/overview',
    adminGuard(async (_req, res) => {
      const { buildOverview } = await import('./admin.js');
      const [students, sessions] = await Promise.all([
        store.listStudents(),
        store.listAllSessions(),
      ]);
      res.json(buildOverview(students, sessions));
    }),
  );

  app.get(
    '/api/admin/roster',
    adminGuard(async (req, res) => {
      const { buildRoster } = await import('./admin.js');
      const [students, sessions] = await Promise.all([
        store.listStudents(),
        store.listAllSessions(),
      ]);
      let roster = buildRoster(students, sessions);
      const q = String(req.query.q ?? '').toLowerCase();
      const batch = String(req.query.batch ?? '');
      if (q) {
        roster = roster.filter(
          (r) => r.name.toLowerCase().includes(q) || r.handle.toLowerCase().includes(q),
        );
      }
      if (batch) roster = roster.filter((r) => r.batch === batch);
      res.json({ roster });
    }),
  );

  app.get(
    '/api/admin/student/:id',
    adminGuard(async (req, res) => {
      const student = await store.getStudent(String(req.params.id));
      if (!student) {
        res.status(404).json({ error: 'student not found' });
        return;
      }
      const interviews = await store.listByStudent(student.id);
      res.json({
        student: {
          id: student.id,
          name: student.name,
          handle: student.handle,
          institution: student.institution,
          batch: student.batch,
          createdAt: student.createdAt,
        },
        interviews,
      });
    }),
  );

  // Lightweight cost peek (kept from stage 5).
  app.get(
    '/api/admin/stats',
    adminGuard(async (_req, res) => {
      res.json({ days: await store.stats() });
    }),
  );

  return app;
}
