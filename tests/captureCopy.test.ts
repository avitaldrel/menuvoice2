import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_CAPTURE_INSTRUCTION,
  AUTO_CAPTURE_STATUS,
  CAPTURE_PAGE_STATUS,
} from '../src/lib/captureCopy.ts';

const wordCount = (copy: string) => copy.trim().split(/\s+/).length;

test('capture arrival copy stays brief and action-first', () => {
  assert.equal(CAPTURE_PAGE_STATUS, 'Capture menu.');
  assert.ok(wordCount(AUTO_CAPTURE_INSTRUCTION) <= 13);
  assert.match(AUTO_CAPTURE_INSTRUCTION, /^Hold your phone flat over the menu\./);
  assert.equal(AUTO_CAPTURE_STATUS, 'Hold your phone flat over the menu.');
});
