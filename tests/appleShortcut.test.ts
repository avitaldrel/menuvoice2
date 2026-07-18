import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppleMobileDevice, normalizeAppleShortcutUrl } from '../src/lib/appleShortcut';

test('accepts a public iCloud Shortcut link', () => {
  assert.equal(
    normalizeAppleShortcutUrl(' https://www.icloud.com/shortcuts/AbC123 '),
    'https://www.icloud.com/shortcuts/AbC123',
  );
});

test('rejects unsafe shortcut links', () => {
  assert.equal(normalizeAppleShortcutUrl('https://example.com/shortcuts/AbC123'), null);
  assert.equal(normalizeAppleShortcutUrl('http://www.icloud.com/shortcuts/AbC123'), null);
  assert.equal(normalizeAppleShortcutUrl(undefined), null);
});

test('detects iPhone and iPad desktop-mode user agents', () => {
  assert.equal(isAppleMobileDevice({ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobileDevice({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobileDevice({ userAgent: 'Android', platform: 'Linux', maxTouchPoints: 5 }), false);
});
