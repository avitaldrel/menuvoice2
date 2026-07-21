import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorMessage, friendlyError } from '../src/lib/errors.ts';
import { sanitizeMenu } from '../src/lib/menuSanitizer.ts';
import { reviewAllergenInput, removeFromList } from '../src/util.ts';

test('sanitizeMenu keeps usable fields and removes malformed menu data', () => {
  const menu = sanitizeMenu({
    restaurantName: '  Example Cafe  ',
    categories: [
      null,
      {
        name: 42,
        items: [
          { name: '  Soup  ', description: '  Tomato  ', price: 12, ingredients: ['tomato', 4, ' basil '] },
          { description: 'Missing a name' },
          'not an item',
        ],
      },
    ],
    incomplete: 'yes',
    pageCount: -4,
    ignored: 'not part of ParsedMenu',
  });

  assert.deepEqual(menu, {
    restaurantName: 'Example Cafe',
    categories: [
      {
        name: 'Menu',
        items: [{ name: 'Soup', description: 'Tomato', ingredients: ['tomato', 'basil'] }],
      },
    ],
    incomplete: false,
  });
});

test('sanitizeMenu rejects a response with no usable named dishes', () => {
  assert.equal(sanitizeMenu(null), null);
  assert.equal(sanitizeMenu({ categories: [{ name: 'Mains', items: [{ price: '$10' }] }] }), null);
});

test('sanitizeMenu caps untrusted menu size before it reaches the UI', () => {
  const oversized = {
    categories: [
      {
        name: 'Everything',
        items: Array.from({ length: 700 }, (_, index) => ({ name: `Dish ${index + 1}` })),
      },
    ],
  };

  assert.equal(sanitizeMenu(oversized)?.categories[0].items.length, 500);
});

// Bug #2b: removing an unrecognized allergy must not be a dead end — the word
// is dropped, every other allergy survives, and the user can retype it.
test('removeFromList drops only the named entry and keeps the rest', () => {
  assert.equal(removeFromList('shellfish, blorf, peanuts', 'blorf'), 'shellfish, peanuts');
  assert.equal(removeFromList('shellfish, BLORF, peanuts', 'blorf'), 'shellfish, peanuts');
  assert.equal(removeFromList('  blorf  ', 'blorf'), '');
});

test('removeFromList leaves an untouched list alone and tidies spacing', () => {
  assert.equal(removeFromList('shellfish,peanuts', 'corn'), 'shellfish, peanuts');
  assert.equal(removeFromList('', 'corn'), '');
});

test('every other allergy survives a removal, so nothing is silently lost', () => {
  const typed = 'peanuts, blorf, shellfish';
  const afterRemoval = removeFromList(typed, 'blorf');
  const review = reviewAllergenInput(afterRemoval.split(','));

  assert.deepEqual(review.accepted, ['peanuts', 'shellfish']);
  assert.deepEqual(review.unknown, []);
});

test('reviewAllergenInput never applies a spelling suggestion silently', () => {
  assert.deepEqual(reviewAllergenInput(['shellfish', 'shellfsh', 'blorf']), {
    accepted: ['shellfish'],
    corrections: [['shellfsh', 'shellfish']],
    unknown: ['blorf'],
  });

  assert.deepEqual(reviewAllergenInput(['shellfsh', 'blorf']), {
    accepted: [],
    corrections: [['shellfsh', 'shellfish']],
    unknown: ['blorf'],
  });

  assert.deepEqual(reviewAllergenInput(['glutin', 'gluten']), {
    accepted: ['gluten'],
    corrections: [['glutin', 'gluten']],
    unknown: [],
  });
});

test('friendlyError replaces technical details and preserves recovery copy', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(
      friendlyError(new Error('Failed to fetch'), 'Try again.'),
      "I couldn't connect. Check your internet connection, then try again.",
    );
    assert.equal(
      friendlyError(new Error('HTTP 500 OPENAI_API_KEY missing'), 'Try again.'),
      'Something went wrong on my end. Please try again in a moment.',
    );
    assert.equal(
      friendlyError(new Error('Please retake the menu photo with more light.'), 'Try again.'),
      'Please retake the menu photo with more light.',
    );
  } finally {
    console.warn = warn;
  }
});

test('apiErrorMessage never exposes a server response body', () => {
  assert.equal(
    apiErrorMessage(400, 'Double-check the restaurant name and try again.'),
    'Double-check the restaurant name and try again.',
  );
  assert.equal(
    apiErrorMessage(503, 'Double-check the restaurant name and try again.'),
    'Something went wrong on my end. Please try again in a moment.',
  );
  assert.equal(
    apiErrorMessage(401, 'Double-check the restaurant name and try again.'),
    "The menu reader isn't available right now. Please try again in a few minutes.",
  );
});
