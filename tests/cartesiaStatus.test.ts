import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCartesiaState, type CartesiaRotationState } from '../api/_cartesiaStatus.ts';
import { renderCartesiaText } from '../api/_morningData.ts';
import { shouldSendMorningReport } from '../api/cron-morning.ts';
import dashboardHandler from '../api/dashboard.ts';

test('Cartesia status exposes slots without exposing API key values', () => {
  const state: CartesiaRotationState = {
    version: 1,
    activeSlot: 2,
    lastSwitchedAt: '2026-07-14T12:00:00.000Z',
    allExhaustedAt: null,
    slots: {
      '1': { activeSince: '2026-07-01T12:00:00.000Z', exhaustedAt: '2026-07-14T12:00:00.000Z', availableAt: '2026-08-13T12:00:00.000Z' },
      '2': { activeSince: '2026-07-14T12:00:00.000Z', lastSuccessAt: '2026-07-16T12:00:00.000Z' },
    },
  };
  const result = summarizeCartesiaState(state, 3, new Date('2026-07-16T12:00:00.000Z'), 720, 'redis');
  assert.equal(result.activeLabel, 'Key 2');
  assert.equal(result.remainingAfterActive, 1);
  assert.equal(result.keys[0].status, 'exhausted');
  assert.equal(result.keys[2].status, 'available');
  assert.equal(result.projectedRunOutAt, '2026-07-27T12:00:00.000Z');
  assert.equal(JSON.stringify(result).includes('sk_car'), false);
});

test('Cartesia status reports complete exhaustion and first estimated return', () => {
  const state: CartesiaRotationState = {
    version: 1,
    activeSlot: null,
    lastSwitchedAt: '2026-07-15T00:00:00.000Z',
    allExhaustedAt: '2026-07-16T00:00:00.000Z',
    slots: {
      '1': { exhaustedAt: '2026-07-15T00:00:00.000Z', availableAt: '2026-08-14T00:00:00.000Z' },
      '2': { exhaustedAt: '2026-07-16T00:00:00.000Z', availableAt: '2026-08-15T00:00:00.000Z' },
    },
  };
  const result = summarizeCartesiaState(state, 2, new Date('2026-07-16T12:00:00.000Z'));
  assert.equal(result.allExhausted, true);
  assert.equal(result.activeSlot, null);
  assert.equal(result.remainingAfterActive, 0);
  assert.equal(result.firstReturnsAt, '2026-08-14T00:00:00.000Z');
  const report = renderCartesiaText(result);
  assert.match(report, /OUT OF CARTESIA KEYS/);
  assert.match(report, /First key estimated back: 2026-08-14 00:00Z/);
  assert.equal(report.trimEnd().endsWith('Status history is temporary until Redis/KV is configured.'), true);
});

test('complete Cartesia exhaustion overrides quiet-day report suppression', () => {
  assert.equal(shouldSendMorningReport({ anyoneUsed: false, cartesia: { allExhausted: false } }), false);
  assert.equal(shouldSendMorningReport({ anyoneUsed: false, cartesia: { allExhausted: true } }), true);
});

test('analytics dashboard shell includes the accessible Cartesia status section', async () => {
  const previous = process.env.REPORT_KEY;
  process.env.REPORT_KEY = 'test-report-key';
  let body = '';
  const response = {
    setHeader() {},
    status() { return this; },
    send(value: string) { body = value; return this; },
  };
  try {
    await dashboardHandler(
      { query: { key: 'test-report-key' } } as never,
      response as never,
    );
  } finally {
    if (previous === undefined) delete process.env.REPORT_KEY;
    else process.env.REPORT_KEY = previous;
  }
  assert.match(body, /<h2>Cartesia API keys<\/h2>/);
  assert.match(body, /id="cartesia" aria-live="polite"/);
  assert.match(body, /renderCartesia\(d\)/);
});
