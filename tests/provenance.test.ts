// Provenance -> speakable copy (pure functions). A fixed `now` keeps freshness
// deterministic. ISO dates are offset from that `now`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshnessOf,
  checkedPhrase,
  provenanceSummary,
  provenanceOpeningNote,
  locationAnswer,
  completenessAnswer,
} from '../src/lib/provenance.ts';
import type { MenuProvenance } from '../src/types.ts';

const NOW = Date.parse('2026-06-27T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

test('freshnessOf buckets by age', () => {
  assert.equal(freshnessOf(daysAgo(0), NOW), 'recent');
  assert.equal(freshnessOf(daysAgo(3), NOW), 'recent');
  assert.equal(freshnessOf(daysAgo(20), NOW), 'aging');
  assert.equal(freshnessOf(daysAgo(120), NOW), 'outdated');
  assert.equal(freshnessOf(undefined, NOW), 'unknown');
  assert.equal(freshnessOf('not-a-date', NOW), 'unknown');
});

test('checkedPhrase reads naturally', () => {
  assert.match(checkedPhrase(daysAgo(0), NOW), /checked today/);
  assert.match(checkedPhrase(daysAgo(1), NOW), /yesterday/);
  assert.match(checkedPhrase(daysAgo(5), NOW), /5 days ago/);
  assert.match(checkedPhrase(daysAgo(200), NOW), /out of date/);
});

const officialSpecific: MenuProvenance = {
  sourceType: 'official_site',
  official: true,
  sourceLabel: 'their website',
  locationScope: 'location_specific',
  confirmedLocation: 'Paramus, New Jersey',
  sourceUrl: 'https://x.com/menu',
  checkedAt: daysAgo(0),
  completeness: 'partial',
  warnings: ['the drinks section is missing'],
};

test('provenanceSummary covers source, location, freshness, completeness', () => {
  const s = provenanceSummary(officialSpecific, 'Cheesecake Factory', NOW);
  assert.match(s, /official menu/);
  assert.match(s, /their website/);
  assert.match(s, /Paramus, New Jersey/);
  assert.match(s, /checked today/);
  // A partial menu must say so outright before explaining why (bug #1).
  assert.match(s, /found only part of this menu, because the drinks section is missing/);
});

test('third-party menu is never called official', () => {
  const tp: MenuProvenance = {
    ...officialSpecific,
    sourceType: 'third_party',
    official: false,
    sourceLabel: 'DoorDash',
    locationScope: 'generic',
    completeness: 'complete',
    warnings: undefined,
  };
  const s = provenanceSummary(tp, 'Luigi', NOW);
  assert.ok(!/official menu/.test(s), 'must not claim official');
  assert.match(s, /third-party listing/);
});

test('opening note is shorter and flags incompleteness', () => {
  const note = provenanceOpeningNote(officialSpecific, NOW);
  assert.match(note, /official source/);
  assert.match(note, /only part of it/i);
});

test('missing provenance degrades gracefully', () => {
  assert.match(provenanceSummary(undefined, 'X'), /do not have details/);
  assert.equal(provenanceOpeningNote(undefined), '');
  assert.match(locationAnswer(undefined), /confirm with the restaurant/);
  assert.match(completenessAnswer(undefined), /not certain/);
});
