import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { InterviewEngine } from './engine.js';
import type { GroqClient } from './llm/groq.js';
import { sanitizeForPrompt } from './sanitize.js';
import type { SessionStore } from './store/SessionStore.js';
import type { InterviewMode } from './types.js';

const MODES: InterviewMode[] = ['resume', 'capstone', 'skill'];

function publicSession(session: NonNullable<Awaited<ReturnType<InterviewEngine['getSession']>>>) {
  return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    brief: session.brief,
    interviewerName: config.interviewerName,
    currentPrompt: session.currentPrompt,
    currentPromptIsFollowUp: session.currentPromptIsFollowUp,
    questionIndex: session.currentQuestionIndex,
    total: config.totalQuestions,
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
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, interviewerName: config.interviewerName });
  });

  // Create a session. Accepts JSON (skill/resume modes) or multipart with a
  // PDF file (capstone mode).
  app.post('/api/session', upload.single('file'), async (req, res) => {
    try {
      const body = req.body as Record<string, string | undefined>;
      const mode = body.mode as InterviewMode | undefined;
      if (!mode || !MODES.includes(mode)) {
        res.status(400).json({ error: 'mode must be one of resume, capstone, skill' });
        return;
      }

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

      const session = await engine.createSession(mode, material, label);
      res.json(publicSession(session));
    } catch (err) {
      console.error('[api] create session failed:', err);
      res.status(502).json({ error: 'Could not set up the interview. Give it a second and try again.' });
    }
  });

  app.get('/api/session/:id', async (req, res) => {
    const session = await engine.getSession(req.params.id);
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
    const session = await engine.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }
    await engine.endSession(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/session/:id/report', async (req, res) => {
    const session = await engine.getSession(req.params.id);
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
    const session = await engine.getSession(req.params.id);
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

  // Lightweight admin peek: interviews/day + average cost. Requires ADMIN_KEY.
  app.get('/api/admin/stats', async (req, res) => {
    if (!config.adminKey || req.query.key !== config.adminKey) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json({ days: await store.stats() });
  });

  return app;
}
