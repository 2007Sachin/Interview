/**
 * Shared Web Audio plumbing: one AudioContext for everything (TTS analysis,
 * mic level metering, UI sounds). All $0 — no audio files, no libraries.
 */

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Turns an AnalyserNode into a smoothed 0..1 level reader: RMS of the time
 * domain with a fast attack and slow release, so motion feels organic rather
 * than jittery.
 */
export function makeLevelReader(analyser: AnalyserNode): () => number {
  const data = new Uint8Array(analyser.fftSize);
  let smoothed = 0;
  return () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = ((data[i] ?? 128) - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    smoothed += (rms - smoothed) * (rms > smoothed ? 0.4 : 0.12);
    return Math.min(1, smoothed * 3.2);
  };
}

export interface MicMeter {
  read: () => number;
  dispose: () => void;
}

/** Live amplitude of the student's mic while they record. */
export function createMicMeter(stream: MediaStream): MicMeter | null {
  const c = audioContext();
  if (!c) return null;
  try {
    const source = c.createMediaStreamSource(stream);
    const analyser = c.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    return {
      read: makeLevelReader(analyser),
      dispose: () => {
        source.disconnect();
        analyser.disconnect();
      },
    };
  } catch {
    return null;
  }
}

/* ── Tiny generated UI sounds (each < 400ms, quiet, mute-able) ──────────── */

const MUTE_KEY = 'interview.muted';
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  localStorage.setItem(MUTE_KEY, value ? '1' : '0');
}

interface Note {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  peak?: number;
}

function playNotes(notes: Note[]): void {
  if (muted || prefersReducedMotion()) return;
  const c = audioContext();
  if (!c || c.state !== 'running') return;
  const now = c.currentTime;
  for (const n of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    const peak = n.peak ?? 0.045;
    gain.gain.setValueAtTime(0, now + n.at);
    gain.gain.linearRampToValueAtTime(peak, now + n.at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);
    osc.connect(gain).connect(c.destination);
    osc.start(now + n.at);
    osc.stop(now + n.at + n.dur + 0.05);
  }
}

/** Soft chime when the interview starts. */
export function playStartChime(): void {
  playNotes([
    { freq: 659.25, at: 0, dur: 0.22 },
    { freq: 987.77, at: 0.1, dur: 0.26, peak: 0.035 },
  ]);
}

/** Gentle tick on question advance. */
export function playAdvanceTick(): void {
  playNotes([{ freq: 1318.5, at: 0, dur: 0.07, type: 'triangle', peak: 0.03 }]);
}

/** Warm two-note motif when the report is ready. */
export function playReportMotif(): void {
  playNotes([
    { freq: 523.25, at: 0, dur: 0.18 },
    { freq: 783.99, at: 0.14, dur: 0.24, peak: 0.05 },
  ]);
}
