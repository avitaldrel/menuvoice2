// Silence detection via the Web Audio API. Watches mic input level and calls
// `onSilence` once the guest has spoken and then gone quiet for `silenceMs`.
// Used so screens never need a manual "done" tap — guests just talk.
//
// `maxMs` is an absolute ceiling: if silence never settles (loud environment),
// the callback fires anyway so the app never hangs indefinitely.

const SPEECH_RMS = 0.015; // volume floor that counts as "talking"
const POLL_MS = 80;

export interface SilenceWatcher {
  cancel: () => void;
}

export function watchForSilence(
  stream: MediaStream,
  silenceMs: number,
  maxMs: number,
  onSilence: () => void
): SilenceWatcher {
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
  } catch {
    // No Web Audio support — fall back to maxMs timer.
    const t = setTimeout(onSilence, maxMs);
    return { cancel: () => clearTimeout(t) };
  }

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const data = new Float32Array(analyser.fftSize);
  const startTime = Date.now();
  let hasSpoken = false;
  let quietSince: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const cleanup = () => {
    try { source.disconnect(); } catch {}
    try { ctx?.close(); } catch {}
  };

  const finish = () => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    cleanup();
    onSilence();
  };

  const tick = () => {
    if (done) return;
    const now = Date.now();
    if (now - startTime >= maxMs) { finish(); return; }

    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);

    if (rms > SPEECH_RMS) {
      hasSpoken = true;
      quietSince = null;
    } else if (hasSpoken) {
      if (quietSince === null) quietSince = now;
      else if (now - quietSince >= silenceMs) { finish(); return; }
    }

    timer = setTimeout(tick, POLL_MS);
  };

  tick();

  return {
    cancel: () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      cleanup();
    },
  };
}
