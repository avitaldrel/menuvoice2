// Post-capture photo quality verdicts (pure function). Builds synthetic
// FrameMetrics directly rather than re-synthesizing images — the imaging math
// itself is already covered by tests/scanner.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateQuality } from '../src/lib/photoQuality.ts';
import type { FrameMetrics } from '../src/lib/scanner.ts';

const GOOD: FrameMetrics = {
  luminance: 120,
  glareFrac: 0.01,
  sharpness: 200,
  edgeDensity: 0.08,
  cx: 0.5,
  cy: 0.5,
  motion: 0,
  bboxWidthFrac: 0.65,
  bboxHeightFrac: 0.6,
  touchesBorder: false,
  skewDeg: 3,
};

test('a well-lit, sharp, level, well-framed photo has no issues', () => {
  const result = evaluateQuality(GOOD);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('no readable content short-circuits other checks', () => {
  const result = evaluateQuality({ ...GOOD, edgeDensity: 0.01, bboxWidthFrac: 0, bboxHeightFrac: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, 'noContent');
});

test('flags a dark photo', () => {
  const result = evaluateQuality({ ...GOOD, luminance: 20 });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'dark'));
});

test('flags a glare-heavy photo', () => {
  const result = evaluateQuality({ ...GOOD, glareFrac: 0.25 });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'glare'));
});

test('flags a blurry photo', () => {
  const result = evaluateQuality({ ...GOOD, sharpness: 10 });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'blurry'));
});

test('flags a photo cropped by the frame edge as too close', () => {
  const result = evaluateQuality({ ...GOOD, touchesBorder: true });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'tooClose'));
});

test('flags a small, centered bounding box as too far', () => {
  const result = evaluateQuality({ ...GOOD, bboxWidthFrac: 0.2, bboxHeightFrac: 0.18 });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'tooFar'));
});

test('flags a tilted photo', () => {
  const result = evaluateQuality({ ...GOOD, skewDeg: 25 });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === 'skewed'));
});

test('reports multiple simultaneous issues, not just the first one found', () => {
  const result = evaluateQuality({ ...GOOD, luminance: 20, sharpness: 10, skewDeg: 30 });
  assert.equal(result.ok, false);
  const codes = result.issues.map((i) => i.code).sort();
  assert.deepEqual(codes, ['blurry', 'dark', 'skewed']);
});
