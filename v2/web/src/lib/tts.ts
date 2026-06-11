import type { KokoroTTS } from 'kokoro-js';

/**
 * Browser TTS via Kokoro (runs locally, $0). The model (~80 MB) downloads on
 * first use and is cached by the browser. If loading or generation fails we
 * degrade gracefully: speak() resolves immediately and the UI stays text-only.
 */

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'af_heart';

let loader: Promise<KokoroTTS | null> | null = null;
let current: HTMLAudioElement | null = null;

export function preloadTts(): Promise<KokoroTTS | null> {
  if (!loader) {
    // Dynamic import keeps the ~2 MB ONNX runtime out of the main bundle.
    loader = import('kokoro-js')
      .then((mod) => mod.KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' }))
      .catch((err: unknown) => {
        console.warn('Kokoro TTS unavailable, continuing without voice:', err);
        return null;
      });
  }
  return loader;
}

export function ttsReady(): boolean {
  return loader !== null;
}

export function stopSpeaking(): void {
  if (current) {
    current.pause();
    current.src = '';
    current = null;
  }
}

/**
 * Speak `text` aloud. Resolves when playback finishes (or immediately when
 * TTS is unavailable). `onStart` fires when audio actually begins.
 */
export async function speak(text: string, onStart?: () => void): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const tts = await preloadTts();
  if (!tts) return;

  stopSpeaking();
  try {
    const audio = await tts.generate(trimmed, { voice: VOICE });
    const url = URL.createObjectURL(audio.toBlob());
    await new Promise<void>((resolve) => {
      const el = new Audio(url);
      current = el;
      el.onended = () => {
        URL.revokeObjectURL(url);
        if (current === el) current = null;
        resolve();
      };
      el.onpause = () => {
        // stopped externally (e.g. user clicked Repeat) — treat as finished
        if (el.ended) return;
        URL.revokeObjectURL(url);
        resolve();
      };
      el.onerror = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      onStart?.();
      void el.play().catch(() => resolve());
    });
  } catch (err) {
    console.warn('TTS generation failed, continuing without voice:', err);
  }
}
