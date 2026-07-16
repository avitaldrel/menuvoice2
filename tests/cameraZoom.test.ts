import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextZoomValue, type ZoomRange } from '../src/lib/camera.ts';

const range: ZoomRange = { min: 0.5, max: 3, step: 0.25, value: 1, native: true };

test('automatic zoom moves one supported step in either direction', () => {
  assert.equal(nextZoomValue(range, 1, 1), 1.25);
  assert.equal(nextZoomValue(range, 1, -1), 0.75);
});

test('automatic zoom clamps at the camera limits', () => {
  assert.equal(nextZoomValue(range, 3, 1), 3);
  assert.equal(nextZoomValue(range, 0.5, -1), 0.5);
});

test('automatic zoom uses a safe fallback step when capabilities omit one', () => {
  assert.equal(nextZoomValue({ ...range, step: 0 }, 1, 1), 1.25);
});
