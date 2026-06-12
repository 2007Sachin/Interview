/**
 * Push-to-talk recording via MediaRecorder. One clip per answer — no
 * streaming. Clips are capped at MAX_SECONDS so a forgotten mic can't
 * produce an enormous upload.
 */

export const MAX_SECONDS = 180;

export class MicPermissionError extends Error {
  constructor() {
    super('microphone permission denied');
  }
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export interface ActiveRecording {
  /** Live mic stream — used for the real-time amplitude ring while recording. */
  stream: MediaStream;
  stop(): Promise<Blob>;
  cancel(): void;
}

export async function requestMicStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new MicPermissionError();
  }
}

export async function startRecording(onAutoStop?: () => void): Promise<ActiveRecording> {
  const stream = await requestMicStream();
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let settled = false;
  let resolveStop: ((blob: Blob) => void) | null = null;
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (resolveStop && !settled) {
      settled = true;
      resolveStop(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    }
  };

  recorder.start();
  const timer = window.setTimeout(() => {
    if (recorder.state === 'recording') {
      onAutoStop?.();
      recorder.stop();
    }
  }, MAX_SECONDS * 1000);

  return {
    stream,
    stop(): Promise<Blob> {
      window.clearTimeout(timer);
      return new Promise((resolve) => {
        resolveStop = resolve;
        if (recorder.state === 'recording') recorder.stop();
        else recorder.onstop?.(new Event('stop'));
      });
    },
    cancel(): void {
      window.clearTimeout(timer);
      settled = true;
      if (recorder.state === 'recording') recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
