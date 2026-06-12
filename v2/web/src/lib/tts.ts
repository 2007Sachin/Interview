import type { KokoroTTS } from 'kokoro-js';
import { audioContext, makeLevelReader } from './audio';

/**
 * Browser TTS via Kokoro (runs locally, $0). The model (~80 MB) downloads on
 * first use and is cached by the browser. If loading or generation fails we
 * degrade gracefully: speak() resolves immediately and the UI stays text-only.
 *
 * Playback is routed through an AnalyserNode so visuals (the orb) can pulse
 * with the actual amplitude of Asha's voice — read it via getTtsLevel().
 */

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'af_heart';

let loader: Promise<KokoroTTS | null> | null = null;
let current: HTMLAudioElement | null = null;
let analyserRead: (() => number) | null = null;
let speaking = false;

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

/** Live 0..1 amplitude of the TTS voice; 0 when not speaking. */
export function getTtsLevel(): number {
  return speaking && analyserRead ? analyserRead() : 0;
}

export function stopSpeaking(): void {
  speaking = false;
  if (current) {
    current.pause();
    current.src = '';
    current = null;
  }
}

/**
 * Route an audio element through the shared AudioContext for analysis.
 * If the context can't run (autoplay policy), leave the element alone so
 * playback still works — visuals just won't be audio-reactive.
 */
function wireAnalyser(el: HTMLAudioElement): void {
  const c = audioContext();
  if (!c || c.state !== 'running') return;
  try {
    const source = c.createMediaElementSource(el);
    const analyser = c.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyser.connect(c.destination);
    analyserRead = makeLevelReader(analyser);
  } catch {
    analyserRead = null;
  }
}

/**
 * Speak `text` aloud. Resolves when playback finishes (or immediately when
 * TTS is unavailable). `onStart` fires when audio actually begins, with the
 * clip duration in seconds (for syncing word reveals to speech).
 */
export async function speak(text: string, onStart?: (durationSeconds: number) => void): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const tts = await preloadTts();
  if (!tts) {
    onStart?.(0);
    return;
  }

  stopSpeaking();
  try {
    const audio = await tts.generate(trimmed, { voice: VOICE });
    const durationSeconds =
      audio.audio.length && audio.sampling_rate ? audio.audio.length / audio.sampling_rate : 0;
    const url = URL.createObjectURL(audio.toBlob());
    await new Promise<void>((resolve) => {
      const el = new Audio(url);
      current = el;
      wireAnalyser(el);
      const finish = () => {
        if (current === el) {
          speaking = false;
          current = null;
        }
        URL.revokeObjectURL(url);
        resolve();
      };
      el.onended = finish;
      el.onpause = () => {
        // stopped externally (e.g. user clicked Repeat) — treat as finished
        if (!el.ended) finish();
      };
      el.onerror = finish;
      speaking = true;
      onStart?.(durationSeconds);
      void el.play().catch(() => {
        speaking = false;
        resolve();
      });
    });
  } catch (err) {
    console.warn('TTS generation failed, continuing without voice:', err);
    onStart?.(0);
  }
}
