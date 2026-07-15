// Allergen detection + explicit/inferred confidence (pure functions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeItemAllergens, allergenAlertText, allergenDisclaimer } from '../src/lib/allergens.ts';
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

test('personal allergen alert keeps inferred matches uncertain', () => {
  const alert = allergenAlertText([{ label: 'shellfish', confidence: 'inferred' }]);
  assert.match(alert, /may contain shellfish/);
  assert.match(alert, /does not confirm it/);
  assert.ok(!/restaurant lists shellfish/.test(alert));
});

test('personal allergen alert identifies explicit restaurant listings', () => {
  const alert = allergenAlertText([{ label: 'soy', confidence: 'explicit' }]);
  assert.match(alert, /restaurant lists soy/);
  assert.match(alert, /confirm with the restaurant/);
});

test('empty findings produce empty disclaimer', () => {
  assert.equal(allergenDisclaimer([]), '');
  assert.equal(allergenAlertText([]), '');
});
