// Source + location-scope classification (server pipeline, pure functions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySource, classifyLocationScope } from '../api/_menuCore.ts';

test('classifySource: restaurant own site is official_site', () => {
  const c = classifySource('https://www.luigis.com/menu');
  assert.equal(c.sourceType, 'official_site');
  assert.equal(c.official, true);
});

test('classifySource: PDF on own domain is official_pdf', () => {
  const c = classifySource('https://luigis.com/files/dinner.pdf', true);
  assert.equal(c.sourceType, 'official_pdf');
  assert.equal(c.official, true);
});

test('classifySource: aggregators are third_party and not official', () => {
  for (const url of [
    'https://www.yelp.com/biz/luigis',
    'https://www.doordash.com/store/luigis-123',
    'https://www.grubhub.com/restaurant/luigis',
    'https://www.tripadvisor.com/Restaurant_Review-luigis',
  ]) {
    const c = classifySource(url);
    assert.equal(c.sourceType, 'third_party', url);
    assert.equal(c.official, false, url);
  }
});

test('classifySource: known ordering platforms are official_ordering', () => {
  const c = classifySource('https://order.toasttab.com/online/luigis');
  assert.equal(c.sourceType, 'official_ordering');
  assert.equal(c.official, true);
});

test('classifySource: a friendly label is produced for known brands', () => {
  assert.match(classifySource('https://www.doordash.com/x').sourceLabel, /DoorDash/);
});

test('classifyLocationScope: city token in the page makes it location_specific', () => {
  const scope = classifyLocationScope(
    'Welcome to our Paramus location at Garden State Plaza.',
    'https://cheesecakefactory.com/locations/paramus',
    'Paramus NJ',
  );
  assert.equal(scope, 'location_specific');
});

test('classifyLocationScope: no city evidence makes it generic', () => {
  const scope = classifyLocationScope(
    'Our nationwide menu of cheesecakes and pasta.',
    'https://cheesecakefactory.com/menu',
    'Paramus NJ',
  );
  assert.equal(scope, 'generic');
});

test('classifyLocationScope: no requested location is unknown', () => {
  assert.equal(classifyLocationScope('anything', 'https://x.com', ''), 'unknown');
  assert.equal(classifyLocationScope('anything', 'https://x.com', null), 'unknown');
});
