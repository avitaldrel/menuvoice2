// Auto-shutter with continuous audio coaching for blind users.
//
// Coaching strategy:
// - Each blocked state has two messages; the second fires after ESCALATE_MS.
// - A heartbeat fires "still looking" if no coaching in HEARTBEAT_MS.
// - In 'content' state, a directional hint is added when content centroid is
//   significantly off-center (guides the user toward the menu text).
// - In 'steadying' state, a spoken countdown fires on specific ticks.
// - After STRUGGLE_MS total without a capture, onStruggle fires → manual mode.

export type AutoCaptureState = 'dark' | 'content' | 'moving' | 'steadying' | 'disarmed';

export interface AutoCaptureCallbacks {
  onCoach: (msg: string) => void;
  onCapture: () => void;
  onStruggle?: () => void;
  onProgress?: (state: AutoCaptureState, steadyCount: number, steadyMax: number) => void;
}

const W = 80;
const H = 60;
const TICK_MS = 180;

const DARK = 35;
const CONTENT_MIN = 7;
const MOTION_STEADY = 6;
const REARM_MOTION = 13;
const STEADY_TICKS = 5;
const ESCALATE_MS = 5500;
const STRUGGLE_MS = 14000;
const HEARTBEAT_MS = 4500;

// Countdown messages on each steady tick (1-indexed). STEADY_TICKS fires capture.
const COUNTDOWN: Record<number, string> = {
  1: 'Hold still.',
  2: 'Three.',
  3: 'Two.',
  4: 'One.',
};

const STAGE_MSGS: Record<string, [string, string]> = {
  dark: [
    "It's a bit dark. Try moving to a brighter spot or closer to a light.",
    "Still too dark. A flashlight or lamp would help. Or tap Take photo to capture now.",
  ],
  content: [
    'Point the camera at the menu text so it fills the screen.',
    'Still not seeing text. Hold the phone flat, about 30 centimeters above the menu. Or tap Take photo to capture now.',
  ],
  moving: [
    'Good — now hold still.',
    'Try resting your elbow on the table to steady your hand. Or tap Take photo whenever you are ready.',
  ],
};

export class AutoCaptureController {
  private timer: ReturnType<typeof setInterval> | null = null;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D | null;
  private prev: Float32Array | null = null;
  private steady = 0;
  private armed = true;
  private armedAt = 0;
  private struggled = false;
  private video: HTMLVideoElement | null = null;
  private cb: AutoCaptureCallbacks | null = null;

  private coachState = '';
  private coachStage = 0;
  private coachAt = 0;
  private lastCoachAt = 0;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  start(video: HTMLVideoElement, cb: AutoCaptureCallbacks) {
    this.stop();
    this.video = video;
    this.cb = cb;
    this.armed = true;
    this.steady = 0;
    this.prev = null;
    this.coachState = '';
    this.coachStage = 0;
    this.coachAt = 0;
    this.lastCoachAt = Date.now();
    this.armedAt = Date.now();
    this.struggled = false;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  acknowledgeCapture() {
    this.armed = false;
    this.steady = 0;
    this.coachState = '';
    this.coachStage = 0;
    this.coachAt = 0;
  }

  private emit(msg: string) {
    this.lastCoachAt = Date.now();
    this.cb?.onCoach(msg);
  }

  private coach(state: string, extraMsg?: string) {
    const msgs = STAGE_MSGS[state];
    if (!msgs) return;
    const now = Date.now();
    if (state !== this.coachState) {
      this.coachState = state;
      this.coachStage = 0;
      this.coachAt = now;
      this.emit(extraMsg ? `${msgs[0]} ${extraMsg}` : msgs[0]);
    } else if (this.coachStage === 0 && now - this.coachAt > ESCALATE_MS) {
      this.coachStage = 1;
      this.coachAt = now;
      this.emit(msgs[1]);
    }
    // Stage 1 reached: go silent until state changes.
  }

  // Compute horizontal/vertical centroid of gradient energy. Returns a direction
  // hint string if content is significantly off-center, else null.
  private directionHint(gray: Float32Array): string | null {
    let gx = 0, gy = 0, total = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 1; x < W; x++) {
        const g = Math.abs(gray[y * W + x] - gray[y * W + x - 1]);
        gx += g * x;
        gy += g * y;
        total += g;
      }
    }
    if (total < 1) return null;
    const cx = gx / total / W; // 0..1
    const cy = gy / total / H;
    const dx = cx - 0.5;
    const dy = cy - 0.5;
    if (Math.abs(dx) < 0.18 && Math.abs(dy) < 0.18) return null;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? 'Move the menu to the left.' : 'Move the menu to the right.';
    }
    return dy > 0 ? 'Move the menu up.' : 'Move the menu down.';
  }

  private tick() {
    const v = this.video;
    if (!v || !this.ctx || !this.cb || v.videoWidth === 0) return;

    this.ctx.drawImage(v, 0, 0, W, H);
    const data = this.ctx.getImageData(0, 0, W, H).data;

    const gray = new Float32Array(W * H);
    let bright = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = g;
      bright += g;
    }
    bright /= W * H;

    let grad = 0, gc = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 1; x < W; x++) {
        grad += Math.abs(gray[y * W + x] - gray[y * W + x - 1]);
        gc++;
      }
    }
    grad /= gc;

    let motion = Infinity;
    if (this.prev) {
      let m = 0;
      for (let i = 0; i < gray.length; i++) m += Math.abs(gray[i] - this.prev[i]);
      motion = m / gray.length;
    }
    this.prev = gray;

    if (!this.armed) {
      this.cb.onProgress?.('disarmed', 0, STEADY_TICKS);
      if (motion > REARM_MOTION) {
        this.armed = true;
        this.steady = 0;
        this.armedAt = Date.now();
        this.struggled = false;
        this.coachState = '';
        this.emit('Ready for the next page.');
      }
      return;
    }

    if (!this.struggled && Date.now() - this.armedAt > STRUGGLE_MS) {
      this.struggled = true;
      this.cb.onStruggle?.();
      return;
    }

    if (bright < DARK) {
      this.steady = 0;
      this.coach('dark');
      this.cb.onProgress?.('dark', 0, STEADY_TICKS);
      return;
    }

    if (grad < CONTENT_MIN) {
      this.steady = 0;
      // Add directional hint when there's at least a little gradient signal.
      const dir = grad > 0.3 ? this.directionHint(gray) : null;
      this.coach('content', dir ?? undefined);
      this.cb.onProgress?.('content', 0, STEADY_TICKS);
      return;
    }

    if (motion === Infinity || motion > MOTION_STEADY) {
      this.steady = 0;
      this.coach('moving');
      this.cb.onProgress?.('moving', 0, STEADY_TICKS);
      return;
    }

    // Steadying — spoken countdown on specific ticks.
    this.steady++;
    if (this.steady >= STEADY_TICKS) {
      this.steady = 0;
      this.emit('Capturing now.');
      this.cb.onProgress?.('steadying', STEADY_TICKS, STEADY_TICKS);
      this.cb.onCapture();
    } else {
      if (this.coachState !== 'steadying') this.coachState = 'steadying';
      const countMsg = COUNTDOWN[this.steady];
      if (countMsg) this.emit(countMsg);
      this.cb.onProgress?.('steadying', this.steady, STEADY_TICKS);
    }

    // Heartbeat: if too quiet, remind the user we're still working.
    if (this.armed && Date.now() - this.lastCoachAt > HEARTBEAT_MS && this.steady === 0) {
      this.emit('Still looking, keep the menu in view.');
    }
  }
}
