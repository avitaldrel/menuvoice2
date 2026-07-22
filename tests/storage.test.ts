import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal localStorage for the isolation tests (node:test has no DOM).
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
  key(i: number) { return [...this.store.keys()][i] ?? null; }
  get length() { return this.store.size; }
}
(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();

import { menuStats, clearLocalUserData, isDifferentUser } from '../src/lib/storage.ts';
import type { ParsedMenu } from '../src/types.ts';

const PROFILE_KEY = 'menuvoice.profile.v1';
const SAVED_KEY = 'menuvoice.savedRestaurants.v1';

test('menuStats counts categories and items without storing menu blobs in events', () => {
  const menu: ParsedMenu = {
    categories: [
      { name: 'Starters', items: [{ name: 'Soup' }, { name: 'Salad' }] },
      { name: 'Mains', items: [{ name: 'Pasta' }] },
    ],
  };

  assert.deepEqual(menuStats(menu), { categoryCount: 2, itemCount: 3 });
});

test('menuStats tolerates an empty parsed menu', () => {
  assert.deepEqual(menuStats({ categories: [] }), { categoryCount: 0, itemCount: 0 });
});

// ── Bug #20: saved-restaurant privacy on a shared browser ──

test('clearLocalUserData removes the profile and saved restaurants', () => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ email: 'a@x.com' }));
  localStorage.setItem(SAVED_KEY, JSON.stringify([{ id: 'r-1', name: 'Private Place' }]));

  clearLocalUserData();

  assert.equal(localStorage.getItem(PROFILE_KEY), null);
  assert.equal(localStorage.getItem(SAVED_KEY), null);
});

test('isDifferentUser is true only when a different account is stored', async () => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ email: 'alice@x.com' }));

  assert.equal(await isDifferentUser('bob@x.com'), true, 'different email');
  assert.equal(await isDifferentUser('ALICE@x.com'), false, 'same email, different case');
  assert.equal(await isDifferentUser('alice@x.com'), false, 'same email');
});

test('isDifferentUser is false when no user is stored yet (first sign-in)', async () => {
  localStorage.removeItem(PROFILE_KEY);
  assert.equal(await isDifferentUser('anyone@x.com'), false);
});

test('a different user signing in does not inherit the previous local saves', async () => {
  // User A leaves saved restaurants behind.
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ email: 'alice@x.com' }));
  localStorage.setItem(SAVED_KEY, JSON.stringify([{ id: 'r-1', name: "Alice's spot" }]));

  // The login flow's guard: clear before restoring when the account differs.
  if (await isDifferentUser('bob@x.com')) clearLocalUserData();

  assert.equal(localStorage.getItem(SAVED_KEY), null, "Bob must not see Alice's saves");
});
