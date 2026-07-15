import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAppHistoryEntry,
  readAppHistoryEntry,
} from '../src/lib/appHistory.ts';

test('creates and reads a MenuVoice browser-history entry', () => {
  const entry = createAppHistoryEntry({ name: 'settings' }, 2);
  assert.deepEqual(readAppHistoryEntry(entry), entry);
});

test('rejects unrelated or malformed browser-history state', () => {
  assert.equal(readAppHistoryEntry(null), null);
  assert.equal(readAppHistoryEntry({ key: 'another-app', version: 1, position: 0 }), null);
  assert.equal(readAppHistoryEntry({ key: 'menuvoice-navigation', version: 1, position: -1 }), null);
  assert.equal(readAppHistoryEntry({ key: 'menuvoice-navigation', version: 1, position: 1, route: { name: 'missing' } }), null);
});
