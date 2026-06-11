import { config } from '../config.js';
import { FileSessionStore } from './fileStore.js';
import type { SessionStore } from './SessionStore.js';

export function createStore(): SessionStore {
  if (config.storageBackend === 'supabase') {
    throw new Error(
      'STORAGE_BACKEND=supabase is implemented in Stage 5 — use STORAGE_BACKEND=file for now.',
    );
  }
  return new FileSessionStore(config.dataDir);
}
