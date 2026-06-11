import { config } from '../config.js';

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResult {
  text: string;
  usage: ChatUsage;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqClient {
  chat(model: string, messages: ChatMessage[], opts?: { json?: boolean; maxTokens?: number }): Promise<ChatResult>;
  transcribe(audio: Buffer, filename: string, mimeType: string): Promise<{ text: string; durationSeconds: number }>;
}

class GroqHttpError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`Groq API error ${status}: ${body.slice(0, 300)}`);
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retriable =
        err instanceof GroqHttpError ? err.status === 429 || err.status >= 500 : true;
      if (!retriable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastError;
}

export const realGroqClient: GroqClient = {
  async chat(model, messages, opts = {}) {
    return withRetry(async () => {
      const res = await fetch(`${config.groqBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.4,
          max_tokens: opts.maxTokens ?? 2048,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (!res.ok) throw new GroqHttpError(res.status, await res.text());
      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: data.choices[0]?.message.content ?? '',
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
      };
    });
  },

  async transcribe(audio, filename, mimeType) {
    return withRetry(async () => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
      form.append('model', config.sttModel);
      form.append('response_format', 'verbose_json');
      const res = await fetch(`${config.groqBaseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.groqApiKey}` },
        body: form,
      });
      if (!res.ok) throw new GroqHttpError(res.status, await res.text());
      const data = (await res.json()) as { text?: string; duration?: number };
      return {
        text: (data.text ?? '').trim(),
        durationSeconds: typeof data.duration === 'number' ? data.duration : 0,
      };
    });
  },
};
