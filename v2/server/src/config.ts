import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Load env from server/.env first, then fall back to v2/.env (the documented location).
dotenv.config({ path: path.resolve(here, '../.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

export const config = {
  port: Number(env('PORT', '3001')),
  groqApiKey: env('GROQ_API_KEY', ''),
  groqBaseUrl: env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),
  sttModel: env('GROQ_STT_MODEL', 'whisper-large-v3-turbo'),
  modelFast: env('GROQ_MODEL_FAST', 'llama-3.1-8b-instant'),
  modelSmart: env('GROQ_MODEL_SMART', 'llama-3.3-70b-versatile'),
  interviewerName: env('INTERVIEWER_NAME', 'Asha'),
  storageBackend: env('STORAGE_BACKEND', 'file') as 'file' | 'supabase',
  dataDir: env('DATA_DIR', path.resolve(here, '../data')),
  supabaseUrl: env('SUPABASE_URL', ''),
  supabaseServiceKey: env('SUPABASE_SERVICE_KEY', ''),
  adminKey: env('ADMIN_KEY', ''),
  totalQuestions: Number(env('TOTAL_QUESTIONS', '8')),
  maxAudioBytes: 25 * 1024 * 1024, // ~3 min of webm/opus is well under this; Groq caps at 25MB
  maxPdfBytes: 10 * 1024 * 1024,
};
