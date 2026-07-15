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

test('dishSpokenLabel puts the dish name first and the warning before other details', () => {
  const item: MenuItem = {
    name: 'Caesar Salad',
    price: '$12',
    description: 'romaine, parmesan, croutons',
  };
  const label = dishSpokenLabel(item, [{ label: 'dairy', confidence: 'inferred' }]);

  assert.ok(label.startsWith('Caesar Salad. Allergen warning.'), label);
  assert.ok(label.indexOf('Allergen warning') < label.indexOf('Price $12'));
  assert.ok(label.indexOf('Allergen warning') < label.indexOf('romaine, parmesan, croutons'));
});

test('dishSpokenLabel keeps the normal compact order when there is no warning', () => {
  const item: MenuItem = { name: 'House Fries', price: '$6' };
  assert.equal(dishSpokenLabel(item), 'House Fries. Price $6');
});

test('dishSpokenLabel includes ingredients after the warning', () => {
  const item: MenuItem = { name: 'Pad Thai', ingredients: ['peanuts', 'rice noodles', 'egg'] };
  const label = dishSpokenLabel(item, [{ label: 'peanuts', confidence: 'explicit' }]);

  assert.ok(label.startsWith('Pad Thai. Allergen warning.'), label);
  assert.ok(label.indexOf('Allergen warning') < label.indexOf('Ingredients:'));
});
