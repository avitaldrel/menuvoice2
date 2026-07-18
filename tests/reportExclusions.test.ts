import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excludeList, isExcludedIdentity } from '../api/_reportExclusions.ts';

test('default exclusions include the requested morning-report account', () => {
  const original = process.env.REPORT_EXCLUDE_EMAILS;
  delete process.env.REPORT_EXCLUDE_EMAILS;
  try {
    assert.equal(excludeList().includes('m.ibkhan@icloud.com'), true);
  } finally {
    if (original === undefined) {
      delete process.env.REPORT_EXCLUDE_EMAILS;
    } else {
      process.env.REPORT_EXCLUDE_EMAILS = original;
    }
  }
});

test('Avi test identities are excluded case-insensitively', () => {
  assert.equal(isExcludedIdentity('avi274', []), true);
  assert.equal(isExcludedIdentity('avi@gmail.com', []), true);
  assert.equal(isExcludedIdentity('AVI1@gmail.com', []), true);
});

test('non-numeric Avi names remain visible', () => {
  assert.equal(isExcludedIdentity('david@gmail.com', []), false);
  assert.equal(isExcludedIdentity('real.user@gmail.com', []), false);
  assert.equal(isExcludedIdentity('avitaldrel.com', []), false);
  assert.equal(isExcludedIdentity('Ravital Trail', []), false);
  assert.equal(isExcludedIdentity('Avi Trail Personal', []), false);
  assert.equal(isExcludedIdentity('aviPersonal@gmail.com', []), false);
  assert.equal(isExcludedIdentity('avi1Personal', []), false);
});

test('exact internal-account exclusions still work', () => {
  assert.equal(isExcludedIdentity(' OWNER@EXAMPLE.COM ', ['owner@example.com'], []), true);
});
