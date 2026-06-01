// Auto-shutter ("self capture") with real-time audio coaching — no heavy CV dep.
//
// Why this approach: a blind/low-vision user cannot aim for a perfect document
// crop, so per-frame edge detection (OpenCV.js) is both fragile in dim
// restaurant light and the wrong abstraction. What actually helps is: keep the
// phone steady over something readable, and the app fires on its own while
// coaching by voice. We measure three cheap signals on a downscaled frame:
//   - brightness  (too dark -> coach for light)
//   - gradient energy (is there detailed content/text in view, and is it sharp)
//   - motion (frame-to-frame difference -> is the phone being held still)
// When it's bright enough, has content, and is held still for ~1s -> capture.
// After a capture it disarms until it sees real movement (a page turn), so it
// won't fire twice on the same page.

export interface AutoCaptureCallbacks {
  onCoach: (msg: string) => void; // coaching text (speak it + show it)
  onCapture: () => void; // fire the shutter
  onStruggle?: () => void; // couldn't fire after a while -> fall back to manual
}

const W = 80;
const H = 60;
const TICK_MS = 180;

const DARK = 35; // mean luminance (0-255) below this = too dark
const CONTENT_MIN = 7; // mean gradient below this = nothing readable / blurry
const MOTION_STEADY = 6; // mean abs frame diff below this = held still
const REARM_MOTION = 13; // movement above this after a shot = new page
const STEADY_TICKS = 5; // consecutive steady ticks before firing (~0.9s)
const STRUGGLE_MS = 11000; // armed this long without firing -> suggest manual

export class AutoCaptureController {
  private timer: ReturnType<typeof setInterval> | null = null;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D | null;
  private prev: Float32Array | null = null;
  private steady = 0;
  private armed = true;
  private lastCoach = '';
  private armedAt = 0;
  private struggled = false;
  private video: HTMLVideoElement | null = null;
  private cb: AutoCaptureCallbacks | null = null;

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
    this.lastCoach = '';
    this.armedAt = Date.now();
    this.struggled = false;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Call after the screen has handled a capture so the next page can arm. */
  acknowledgeCapture() {
    this.armed = false;
    this.steady = 0;
    this.lastCoach = '';
  }

  private coach(msg: string) {
    if (msg && msg !== this.lastCoach) {
      this.lastCoach = msg;
      this.cb?.onCoach(msg);
    }
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

    // Horizontal gradient energy ~ amount of detail/text + focus.
    let grad = 0;
    let gc = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 1; x < W; x++) {
        grad += Math.abs(gray[y * W + x] - gray[y * W + x - 1]);
        gc++;
      }
    }
    grad /= gc;

    // Motion vs previous frame.
    let motion = Infinity;
    if (this.prev) {
      let m = 0;
      for (let i = 0; i < gray.length; i++) m += Math.abs(gray[i] - this.prev[i]);
      motion = m / gray.length;
    }
    this.prev = gray;

    if (!this.armed) {
      if (motion > REARM_MOTION) {
        this.armed = true;
        this.steady = 0;
        this.armedAt = Date.now();
        this.struggled = false;
        this.coach('Ready for the next page.');
      }
      return;
    }

    // Took too long to fire this page -> hand off to manual.
    if (!this.struggled && Date.now() - this.armedAt > STRUGGLE_MS) {
      this.struggled = true;
      this.cb.onStruggle?.();
      return;
    }

    if (bright < DARK) {
      this.steady = 0;
      this.coach('It’s a bit dark. Try more light, or move a little closer.');
      return;
    }
    if (grad < CONTENT_MIN) {
      this.steady = 0;
      this.coach('Point it at the menu so I can see the text.');
      return;
    }
    if (motion === Infinity || motion > MOTION_STEADY) {
      this.steady = 0;
      this.coach('Good — now hold still.');
      return;
    }

    // Bright + content + steady.
    this.steady++;
    if (this.steady >= STEADY_TICKS) {
      this.steady = 0;
      this.coach('Capturing now.');
      this.cb.onCapture();
    } else {
      this.coach('Hold it… almost there.');
    }
  }
}
