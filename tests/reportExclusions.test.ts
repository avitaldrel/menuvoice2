import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExcludedIdentity } from '../api/_reportExclusions.ts';

test('Avi test identities are excluded case-insensitively', () => {
  assert.equal(isExcludedIdentity('avi274', [], ['avi']), true);
  assert.equal(isExcludedIdentity('avi@gmail.com', [], ['avi']), true);
  assert.equal(isExcludedIdentity('AVI1@gmail.com', [], ['avi']), true);
});

test('identities containing avi away from the start remain visible', () => {
  assert.equal(isExcludedIdentity('david@gmail.com', [], ['avi']), false);
  assert.equal(isExcludedIdentity('real.user@gmail.com', [], ['avi']), false);
});

test('exact internal-account exclusions still work', () => {
  assert.equal(isExcludedIdentity(' OWNER@EXAMPLE.COM ', ['owner@example.com'], ['avi']), true);
});
