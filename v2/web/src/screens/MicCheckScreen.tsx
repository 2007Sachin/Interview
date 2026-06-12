import { useEffect, useRef, useState } from 'react';
import { requestMicStream } from '../lib/recorder';
import { preloadTts, speak } from '../lib/tts';

interface Props {
  interviewerName: string;
  onContinue: (micWorks: boolean) => void;
}

type MicStatus = 'idle' | 'testing' | 'ok' | 'denied';

export function MicCheckScreen({ interviewerName, onContinue }: Props) {
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [levelHeard, setLevelHeard] = useState(false);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [speakerBusy, setSpeakerBusy] = useState(false);
  const meterRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Warm the TTS model while the student is on this screen.
  useEffect(() => {
    void preloadTts();
    return () => cleanupRef.current?.();
  }, []);

  async function testMic() {
    setMicStatus('testing');
    try {
      const stream = await requestMicStream();
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        if (meterRef.current) {
          meterRef.current.style.transform = `scaleX(${Math.min(1, peak * 3)})`;
        }
        if (peak > 0.08) setLevelHeard(true);
        raf = requestAnimationFrame(tick);
      };
      tick();
      cleanupRef.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      setMicStatus('ok');
    } catch {
      setMicStatus('denied');
    }
  }

  async function testSpeaker() {
    setSpeakerBusy(true);
    await speak(`Hi! If you can hear me clearly, you're all set.`);
    setSpeakerBusy(false);
    setSpeakerTested(true);
  }

  return (
    <main className="screen enter">
      <p className="screen-kicker">Joining your interview</p>
      <h1>Quick sound check</h1>
      <span className="beam" aria-hidden="true" />
      <p className="screen-sub">
        Two quick checks so {interviewerName} can hear you and you can hear {interviewerName}.
      </p>

      <div className="check-step">
        <span className="check-num" aria-hidden="true">
          01
        </span>
        <div>
          <p className="label">Microphone</p>
          {micStatus !== 'ok' && (
            <button
              className="btn btn-secondary"
              style={{ marginTop: 'var(--space-2)' }}
              onClick={() => void testMic()}
              disabled={micStatus === 'testing'}
            >
              {micStatus === 'testing' ? 'Asking for permission…' : 'Test my microphone'}
            </button>
          )}
          {micStatus === 'ok' && (
            <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <div className="meter">
                <div className="meter-fill" ref={meterRef} style={{ transform: 'scaleX(0)' }} />
              </div>
              <p style={{ margin: 0, fontSize: 'var(--fs-small)', color: levelHeard ? 'var(--success)' : 'var(--text-secondary)' }}>
                {levelHeard ? 'Heard you loud and clear ✓' : 'Say something — the bar should move.'}
              </p>
            </div>
          )}
          {micStatus === 'denied' && (
            <p className="error-note" style={{ marginTop: 'var(--space-2)' }}>
              Microphone access was blocked. Click the lock/camera icon in your browser's address
              bar to allow it, then test again — or continue anyway and type your answers instead.
            </p>
          )}
        </div>
      </div>

      <div className="check-step">
        <span className="check-num" aria-hidden="true">
          02
        </span>
        <div>
          <p className="label">Speakers</p>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 'var(--space-2)' }}
            onClick={() => void testSpeaker()}
            disabled={speakerBusy}
          >
            {speakerBusy
              ? 'Playing… (first time loads the voice — can take a minute)'
              : speakerTested
                ? 'Play it again'
                : `Hear ${interviewerName}'s voice`}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            cleanupRef.current?.();
            onContinue(micStatus === 'ok');
          }}
        >
          {micStatus === 'denied' ? "Continue — I'll type my answers" : 'Continue'}
        </button>
      </div>
    </main>
  );
}
