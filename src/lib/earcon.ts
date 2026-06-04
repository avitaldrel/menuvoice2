// Short audio cues (earcons) for mic start/stop. Generated with the Web Audio
// API — no audio files needed. Low volume so they don't startle.

function play(tones: { freq: number; dur: number; vol?: number }[], delayMs = 0) {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx() as AudioContext;
    let t = ctx.currentTime + delayMs / 1000;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = tone.freq;
      const v = tone.vol ?? 0.18;
      gain.gain.setValueAtTime(v, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
      osc.start(t);
      osc.stop(t + tone.dur + 0.01);
      t += tone.dur + 0.02;
    }
    // Close after all tones finish.
    const total = tones.reduce((s, n) => s + n.dur + 0.02, delayMs / 1000) + 0.1;
    setTimeout(() => ctx.close().catch(() => {}), total * 1000);
  } catch {}
}

/** Ascending double-ping: mic is now listening. */
export function earconStart() {
  play([{ freq: 660, dur: 0.07 }, { freq: 880, dur: 0.07 }]);
}

/** Single descending ping: mic stopped. */
export function earconStop() {
  play([{ freq: 660, dur: 0.09 }]);
}

/** Short low tone: error or no-match. */
export function earconError() {
  play([{ freq: 300, dur: 0.12, vol: 0.12 }]);
}

/** Rising tick: one step closer to auto-capture. n=current count, max=total. */
export function earconTick(n: number, max: number) {
  const freq = 380 + (n / max) * 640; // 380 Hz first tick → 1020 Hz last
  play([{ freq, dur: 0.055, vol: 0.17 }]);
}

/** Shutter click: auto-capture fired. */
export function earconCapture() {
  play([
    { freq: 1100, dur: 0.03, vol: 0.22 },
    { freq: 700, dur: 0.07, vol: 0.16 },
  ]);
}
