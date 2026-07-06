// Scanner framing detection (pure function). Synthesizes grayscale frames
// with a "page" region containing high-contrast stripes at a known angle, so
// bounding-box and skew measurements can be checked against known values
// without needing a real camera/canvas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFrameMetrics } from '../src/lib/scanner.ts';

const W = 160;
const H = 120;
const BACKGROUND = 180; // uniform, edge-free "table" outside the page region

interface Bbox { minX: number; maxX: number; minY: number; maxY: number }

/**
 * A grayscale frame with a uniform background and a rectangular "page"
 * region filled with alternating high-contrast stripes. `lineAngleDeg` is the
 * angle of the stripe BOUNDARY lines from horizontal (0 = horizontal lines,
 * like text baselines; 90 = vertical lines, like letter stems/page edges).
 */
function makeFrame(bbox: Bbox, lineAngleDeg: number, period = 6): Float32Array {
  const gray = new Float32Array(W * H).fill(BACKGROUND);
  const rad = (lineAngleDeg * Math.PI) / 180;
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  for (let y = bbox.minY; y <= bbox.maxY; y++) {
    for (let x = bbox.minX; x <= bbox.maxX; x++) {
      const d = x * nx + y * ny;
      gray[y * W + x] = Math.floor(d / period) % 2 === 0 ? 40 : 220;
    }
  }
  return gray;
}

const CENTERED: Bbox = { minX: 32, maxX: 128, minY: 24, maxY: 96 }; // ~60% of frame, centered
const FULL_FRAME: Bbox = { minX: 0, maxX: W - 1, minY: 0, maxY: H - 1 };
const SMALL_CENTERED: Bbox = { minX: 65, maxX: 95, minY: 50, maxY: 70 }; // ~19% x ~17%

test('a well-framed, level page reads as in-frame and not skewed', () => {
  const frame = makeFrame(CENTERED, 0);
  const m = computeFrameMetrics(frame, W, H, null);
  assert.ok(m.bboxWidthFrac > 0.5 && m.bboxWidthFrac < 0.8, `bboxWidthFrac=${m.bboxWidthFrac}`);
  assert.ok(m.bboxHeightFrac > 0.5 && m.bboxHeightFrac < 0.8, `bboxHeightFrac=${m.bboxHeightFrac}`);
  assert.equal(m.touchesBorder, false);
  assert.ok(m.skewDeg < 12, `skewDeg=${m.skewDeg} should be well under the 12deg warn threshold`);
});

test('content bleeding to opposite frame edges reads as too close', () => {
  const frame = makeFrame(FULL_FRAME, 0);
  const m = computeFrameMetrics(frame, W, H, null);
  assert.equal(m.touchesBorder, true, 'a page filling the whole frame should be flagged as touching the border');
});

test('a small, centered page reads as too far (small bounding box)', () => {
  const frame = makeFrame(SMALL_CENTERED, 0);
  const m = computeFrameMetrics(frame, W, H, null);
  assert.ok(m.bboxWidthFrac < 0.42, `bboxWidthFrac=${m.bboxWidthFrac} should be below the too-far threshold`);
  assert.ok(m.bboxHeightFrac < 0.42, `bboxHeightFrac=${m.bboxHeightFrac} should be below the too-far threshold`);
  assert.equal(m.touchesBorder, false, 'a small centered page should not also read as too close');
});

test('a page rotated ~20 degrees reads as skewed', () => {
  const level = computeFrameMetrics(makeFrame(CENTERED, 0), W, H, null);
  const tilted = computeFrameMetrics(makeFrame(CENTERED, 20), W, H, null);
  assert.ok(tilted.skewDeg > level.skewDeg, `tilted skew (${tilted.skewDeg}) should exceed level skew (${level.skewDeg})`);
  assert.ok(tilted.skewDeg > 12, `skewDeg=${tilted.skewDeg} should cross the 12deg warn threshold`);
  // The measured skew should roughly track the actual rotation, allowing for
  // discretization error at 160x120.
  assert.ok(Math.abs(tilted.skewDeg - 20) < 10, `skewDeg=${tilted.skewDeg} should be roughly close to the 20deg rotation applied`);
});

test('a page rotated a further amount reads as more skewed, up to the 45deg diagonal ceiling', () => {
  const m20 = computeFrameMetrics(makeFrame(CENTERED, 20), W, H, null);
  const m35 = computeFrameMetrics(makeFrame(CENTERED, 35), W, H, null);
  assert.ok(m35.skewDeg > m20.skewDeg, `35deg rotation (${m35.skewDeg}) should read as more skewed than 20deg (${m20.skewDeg})`);
});

test('KNOWN LIMITATION: an exact 90-degree rotation is indistinguishable from level', () => {
  // Local edge-gradient orientation cannot tell a page rotated 0deg from one
  // rotated 90deg — both are equally "axis aligned", just on different axes.
  // Detecting a true 90deg turn (phone held sideways) would need document
  // boundary/aspect-ratio detection, which this lightweight per-frame
  // heuristic does not do. This test documents that gap rather than hiding it.
  const level = computeFrameMetrics(makeFrame(CENTERED, 0), W, H, null);
  const rotated90 = computeFrameMetrics(makeFrame(CENTERED, 90), W, H, null);
  assert.ok(level.skewDeg < 12);
  assert.ok(rotated90.skewDeg < 12, `rotated90.skewDeg=${rotated90.skewDeg} — expected to also read as level (documents the blind spot)`);
});

test('a blank, edge-free frame reports no content rather than a false too-far/too-close reading', () => {
  const blank = new Float32Array(W * H).fill(BACKGROUND);
  const m = computeFrameMetrics(blank, W, H, null);
  assert.equal(m.bboxWidthFrac, 0);
  assert.equal(m.bboxHeightFrac, 0);
  assert.equal(m.touchesBorder, false);
  assert.equal(m.skewDeg, 0);
  // In the real scanner, edgeDensity below EDGE_MIN routes to the 'searching'
  // state before framing checks ever run, so a blank frame is never
  // misreported as "too far" — verified here at the metrics level.
  assert.ok(m.edgeDensity < 0.035, `edgeDensity=${m.edgeDensity} should be below EDGE_MIN so 'searching' takes priority`);
});

test('motion is Infinity on the first frame and a real number once a previous frame exists', () => {
  const frame1 = makeFrame(CENTERED, 0);
  const frame2 = makeFrame(CENTERED, 0);
  const first = computeFrameMetrics(frame1, W, H, null);
  const second = computeFrameMetrics(frame2, W, H, frame1);
  assert.equal(first.motion, Infinity);
  assert.ok(Number.isFinite(second.motion));
  assert.equal(second.motion, 0, 'identical consecutive frames should read as zero motion');
});
