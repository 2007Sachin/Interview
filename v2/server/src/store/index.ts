import { config } from '../config.js';
import { FileSessionStore } from './fileStore.js';
import { SupabaseSessionStore } from './supabaseStore.js';
import type { SessionStore } from './SessionStore.js';

export function createStore(): SessionStore {
  if (config.storageBackend === 'supabase') {
    return new SupabaseSessionStore(config.supabaseUrl, config.supabaseServiceKey);
  }
  return new FileSessionStore(config.dataDir);
}
