// Allergen detection + explicit/inferred confidence (pure functions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeItemAllergens, allergenDisclaimer, dishSpokenLabel } from '../src/lib/allergens.ts';
import type { MenuItem } from '../src/types.ts';

test('blocks a dish containing a profile allergen', () => {
  const item: MenuItem = { name: 'Shrimp scampi', description: 'with garlic butter' };
  const info = analyzeItemAllergens(item, ['shellfish']);
  assert.equal(info.blocked, true);
  assert.ok(info.blockedBy.some((f) => f.label === 'shellfish'));
});

test('does not block when allergen absent; lists other allergens as inferred', () => {
  const item: MenuItem = { name: 'Margherita pizza', description: 'mozzarella, basil' };
  const info = analyzeItemAllergens(item, ['peanuts']);
  assert.equal(info.blocked, false);
  const dairy = info.otherAllergens.find((f) => f.label === 'dairy');
  assert.ok(dairy, 'dairy detected from mozzarella');
  assert.equal(dairy!.confidence, 'inferred');
});

test('explicit declaration is marked explicit', () => {
  const item: MenuItem = { name: 'House salad', description: 'Contains peanuts and blue cheese' };
  const info = analyzeItemAllergens(item, []);
  const peanut = info.otherAllergens.find((f) => f.label === 'peanuts');
  assert.ok(peanut);
  assert.equal(peanut!.confidence, 'explicit');
});

test('allergenDisclaimer never presents inferred as confirmed', () => {
  const d = allergenDisclaimer([{ label: 'dairy', confidence: 'inferred' }]);
  assert.match(d, /may contain dairy/);
  assert.match(d, /does not confirm/);
  assert.ok(!/The restaurant lists/.test(d));
});

test('allergenDisclaimer reports explicit declarations as listed', () => {
  const d = allergenDisclaimer([{ label: 'soy', confidence: 'explicit' }]);
  assert.match(d, /The restaurant lists soy/);
});

test('empty findings produce empty disclaimer', () => {
  assert.equal(allergenDisclaimer([]), '');
});

test('dishSpokenLabel puts the allergen warning FIRST, before name/price/description', () => {
  const item: MenuItem = { name: 'Caesar Salad', price: '$12', description: 'romaine, parmesan, croutons' };
  const label = dishSpokenLabel(item, [{ label: 'dairy', confidence: 'inferred' }]);
  assert.ok(label.startsWith('Allergen warning.'), `expected label to start with the warning, got: "${label}"`);
  // The rest of the dish info must still be present, just after the warning.
  assert.match(label, /Caesar Salad/);
  assert.match(label, /\$12/);
  assert.match(label, /romaine, parmesan, croutons/);
});

test('dishSpokenLabel has no warning prefix when there are no other allergens', () => {
  const item: MenuItem = { name: 'House Fries', price: '$6' };
  const label = dishSpokenLabel(item, []);
  assert.equal(label, 'House Fries, $6');
  assert.ok(!label.includes('Allergen warning'));
});

test('dishSpokenLabel includes ingredients after the name/price/description', () => {
  const item: MenuItem = { name: 'Pad Thai', ingredients: ['peanuts', 'rice noodles', 'egg'] };
  const label = dishSpokenLabel(item, [{ label: 'peanuts', confidence: 'explicit' }]);
  assert.ok(label.startsWith('Allergen warning.'));
  assert.match(label, /Ingredients: peanuts, rice noodles, egg/);
  // Warning text must come before the dish name in the final string.
  assert.ok(label.indexOf('Allergen warning') < label.indexOf('Pad Thai'));
});
