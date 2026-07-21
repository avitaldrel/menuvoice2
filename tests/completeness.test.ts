// Deterministic menu-completeness checks (bug #1).
// A short fragment must never be announced as the restaurant's whole menu,
// even when the extraction model reports it as complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessMenuCompleteness, applyCompleteness } from '../api/_menuCore.ts';
import type { ParsedMenu } from '../api/_menuCore.ts';

/** Build a menu with `count` items spread over `categories` sections. */
function menuWith(count: number, categories = 3): ParsedMenu {
  const cats = Array.from({ length: categories }, (_, c) => ({
    name: `Section ${c + 1}`,
    items: [] as { name: string }[],
  }));
  for (let i = 0; i < count; i++) cats[i % categories].items.push({ name: `Dish ${i + 1}` });
  return { categories: cats.filter((c) => c.items.length > 0) };
}

test('a three-item fragment is never called complete', () => {
  const verdict = assessMenuCompleteness(menuWith(3));
  assert.equal(verdict.incomplete, true);
  assert.match(verdict.reason!, /only found 3 dishes/);
});

test('a five-item fragment is never called complete', () => {
  const verdict = assessMenuCompleteness(menuWith(5));
  assert.equal(verdict.incomplete, true);
  assert.match(verdict.reason!, /only found 5 dishes/);
});

test('a single dish reads as one dish, not "1 dishes"', () => {
  const verdict = assessMenuCompleteness(menuWith(1, 1));
  assert.equal(verdict.incomplete, true);
  assert.match(verdict.reason!, /only found 1 dish,/);
});

test('an empty menu is incomplete', () => {
  assert.equal(assessMenuCompleteness({ categories: [] }).incomplete, true);
});

test('a full multi-section menu is allowed to be complete', () => {
  const verdict = assessMenuCompleteness(menuWith(24, 4));
  assert.equal(verdict.incomplete, false);
  assert.equal(verdict.reason, undefined);
});

test('the model saying incomplete always stands, however large the menu', () => {
  const menu = { ...menuWith(40, 5), incomplete: true, incompleteReason: 'the text was cut off' };
  const verdict = assessMenuCompleteness(menu);
  assert.equal(verdict.incomplete, true);
  assert.equal(verdict.reason, 'the text was cut off');
});

test('one section with few items is treated as a single section, not a menu', () => {
  const verdict = assessMenuCompleteness(menuWith(10, 1));
  assert.equal(verdict.incomplete, true);
  assert.match(verdict.reason!, /one section/);
});

test('a listing site needs more dishes before it counts as whole', () => {
  const menu = menuWith(9, 3);
  assert.equal(assessMenuCompleteness(menu, { sourceType: 'third_party' }).incomplete, true);
  // The same menu from the restaurant's own site is acceptable.
  assert.equal(assessMenuCompleteness(menu, { sourceType: 'official_site' }).incomplete, false);
});

test('a page that says it continues elsewhere is incomplete', () => {
  const verdict = assessMenuCompleteness(menuWith(20, 3), {
    sourceText: 'Starters ... Mains ... continued on next page',
  });
  assert.equal(verdict.incomplete, true);
  assert.match(verdict.reason!, /continues somewhere else/);
});

test('a section named in the text but missing from the menu is flagged', () => {
  const menu = menuWith(20, 2); // sections are "Section 1"/"Section 2"
  const verdict = assessMenuCompleteness(menu, {
    sourceText: 'Our dessert selection is served all evening.',
  });
  assert.equal(verdict.incomplete, true);
  assert.match(verdict.reason!, /dessert section/);
});

test('applyCompleteness marks the menu itself and returns provenance fields', () => {
  const menu = menuWith(4);
  const fields = applyCompleteness(menu);

  assert.equal(fields.completeness, 'partial');
  assert.ok(fields.warnings && fields.warnings.length === 1);
  // The menu object carries the verdict too, so the client agrees with provenance.
  assert.equal(menu.incomplete, true);
  assert.match(menu.incompleteReason!, /only found 4 dishes/);
});

test('applyCompleteness clears a stale incomplete flag path for a full menu', () => {
  const menu = menuWith(30, 5);
  const fields = applyCompleteness(menu, { sourceType: 'official_site' });

  assert.equal(fields.completeness, 'complete');
  assert.equal(menu.incomplete, false);
  assert.equal(menu.incompleteReason, undefined);
});
