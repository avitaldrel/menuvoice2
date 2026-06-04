// Auto-shutter ("self capture") with real-time audio coaching — no heavy CV dep.
//
// Coaching strategy: each blocked state has two messages. The first fires
// immediately on entering the state. If still stuck after ESCALATE_MS, the
// second fires (more specific advice + mention of the Override button). After
// STRUGGLE_MS total without a capture, onStruggle fires and hands off to manual.

/** Visual state reported to the UI every tick so it can draw the guidance overlay. */
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
const ESCALATE_MS = 5500;  // time before escalating to the follow-up message
const STRUGGLE_MS = 14000; // total armed time before giving up and going manual

const STAGE_MSGS: Record<string, [string, string]> = {
  dark: [
    "It's a bit dark. Try moving to a brighter spot or closer to a light.",
    "Still too dark. A flashlight or lamp would help. Or tap Override to take the photo now.",
  ],
  content: [
    'Point the camera at the menu text so it fills the screen.',
    'Still not seeing text. Hold the phone flat, about 30 centimeters above the menu. Or tap Override to take the photo now.',
  ],
  moving: [
    'Good -- now hold still.',
    'Try resting your elbow on the table to steady your hand. Or tap Override whenever you are ready.',
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

  private coachState = '';   // which state we're currently coaching
  private coachStage = 0;    // 0 = initial, 1 = escalated
  private coachAt = 0;       // when we last spoke

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

  private coach(state: string) {
    const msgs = STAGE_MSGS[state];
    if (!msgs) return;
    const now = Date.now();
    if (state !== this.coachState) {
      // New state: speak stage 0 immediately.
      this.coachState = state;
      this.coachStage = 0;
      this.coachAt = now;
      this.cb?.onCoach(msgs[0]);
    } else if (this.coachStage === 0 && now - this.coachAt > ESCALATE_MS) {
      // Still stuck: escalate to stage 1 (different, more helpful message).
      this.coachStage = 1;
      this.coachAt = now;
      this.cb?.onCoach(msgs[1]);
    }
    // Stage 1 reached: go silent until state changes.
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
        this.cb?.onCoach('Ready for the next page.');
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
      this.coach('content');
      this.cb.onProgress?.('content', 0, STEADY_TICKS);
      return;
    }
    if (motion === Infinity || motion > MOTION_STEADY) {
      this.steady = 0;
      this.coach('moving');
      this.cb.onProgress?.('moving', 0, STEADY_TICKS);
      return;
    }

    this.steady++;
    if (this.steady >= STEADY_TICKS) {
      this.steady = 0;
      this.cb?.onCoach('Capturing now.');
      this.cb.onProgress?.('steadying', STEADY_TICKS, STEADY_TICKS);
      this.cb.onCapture();
    } else {
      if (this.coachState !== 'steadying') {
        this.coachState = 'steadying';
        this.cb?.onCoach('Hold it... almost there.');
      }
      this.cb.onProgress?.('steadying', this.steady, STEADY_TICKS);
    }
  }
}
