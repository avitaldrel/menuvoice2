// Post-capture photo quality check — reuses the SAME per-frame math as the
// live auto-capture scanner (lib/scanner.ts), so "should I retake this"
// judges a still photo by the identical dark/blur/glare/framing/skew
// thresholds already tuned for the live camera. This covers the two capture
// paths the live scanner never sees: manual "Take photo" shots and uploaded
// library photos — neither gets any quality feedback today, which matters
// most for a blind/low-vision user who cannot glance at a thumbnail to judge
// whether a shot came out blurry, dark, or cropped.

import { computeFrameMetrics, LUM_DARK, GLARE_FRAC, SHARP_MIN, EDGE_MIN, TOO_FAR_BBOX, SKEW_WARN_DEG } from './scanner';
import type { FrameMetrics } from './scanner';

const ANALYSIS_MAX_DIM = 160; // matches the live scanner's per-frame analysis scale

export interface PhotoQualityIssue {
  code: 'noContent' | 'dark' | 'glare' | 'blurry' | 'tooClose' | 'tooFar' | 'skewed';
  message: string;
}

export interface PhotoQualityResult {
  ok: boolean;
  issues: PhotoQualityIssue[];
}

/**
 * Pure: turn already-computed frame metrics into a quality verdict. Kept
 * separate from image decoding so it's directly unit-testable with
 * synthetic FrameMetrics, without needing a DOM/canvas.
 */
export function evaluateQuality(m: FrameMetrics): PhotoQualityResult {
  const issues: PhotoQualityIssue[] = [];

  if (m.edgeDensity < EDGE_MIN) {
    // No readable content at all — other checks would be meaningless noise.
    issues.push({ code: 'noContent', message: "This photo doesn't look like it has readable menu text." });
    return { ok: false, issues };
  }
  if (m.luminance < LUM_DARK) {
    issues.push({ code: 'dark', message: 'This photo looks too dark to read.' });
  }
  if (m.glareFrac > GLARE_FRAC) {
    issues.push({ code: 'glare', message: 'This photo has a lot of glare.' });
  }
  if (m.sharpness < SHARP_MIN) {
    issues.push({ code: 'blurry', message: 'This photo looks blurry.' });
  }
  if (m.touchesBorder) {
    issues.push({ code: 'tooClose', message: 'This photo looks cropped, like the menu did not fully fit in frame.' });
  } else if (m.bboxWidthFrac < TOO_FAR_BBOX && m.bboxHeightFrac < TOO_FAR_BBOX) {
    issues.push({ code: 'tooFar', message: 'The menu looks small in this photo.' });
  }
  if (m.skewDeg > SKEW_WARN_DEG) {
    issues.push({ code: 'skewed', message: 'This photo looks tilted.' });
  }

  return { ok: issues.length === 0, issues };
}

/**
 * DOM-dependent: decode a base64 JPEG (no data: prefix), downsample it to
 * the same analysis scale the live scanner uses, and assess quality.
 * Fails open (reports "ok") on any decode error — a quality check must never
 * block the capture flow.
 */
export function assessPhotoQuality(base64Jpeg: string): Promise<PhotoQualityResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, ANALYSIS_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight, 1));
        const w = Math.max(2, Math.round(img.naturalWidth * scale));
        const h = Math.max(2, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve({ ok: true, issues: [] }); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const gray = new Float32Array(w * h);
        for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
          gray[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        }
        resolve(evaluateQuality(computeFrameMetrics(gray, w, h, null)));
      } catch {
        resolve({ ok: true, issues: [] });
      }
    };
    img.onerror = () => resolve({ ok: true, issues: [] });
    img.src = `data:image/jpeg;base64,${base64Jpeg}`;
  });
}
