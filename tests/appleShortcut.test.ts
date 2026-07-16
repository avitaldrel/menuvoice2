import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppleMobileDevice, normalizeAppleShortcutUrl } from '../src/lib/appleShortcut';

test('accepts a public iCloud Shortcut link', () => {
  assert.equal(
    normalizeAppleShortcutUrl(' https://www.icloud.com/shortcuts/AbC123 '),
    'https://www.icloud.com/shortcuts/AbC123',
  );
});

test('rejects links that are not public iCloud Shortcut links', () => {
  assert.equal(normalizeAppleShortcutUrl('https://example.com/shortcuts/AbC123'), null);
  assert.equal(normalizeAppleShortcutUrl('http://www.icloud.com/shortcuts/AbC123'), null);
  assert.equal(normalizeAppleShortcutUrl('https://www.icloud.com/drive/AbC123'), null);
  assert.equal(normalizeAppleShortcutUrl(undefined), null);
});

test('detects iPhone and iPad desktop-mode user agents', () => {
  assert.equal(isAppleMobileDevice({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    platform: 'iPhone',
    maxTouchPoints: 5,
  }), true);
  assert.equal(isAppleMobileDevice({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  }), true);
  assert.equal(isAppleMobileDevice({
    userAgent: 'Mozilla/5.0 (Linux; Android 15)',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
  }), false);
});
