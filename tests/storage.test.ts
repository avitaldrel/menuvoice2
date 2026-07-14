import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuStats } from '../src/lib/storage.ts';
import type { ParsedMenu } from '../src/types.ts';

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
