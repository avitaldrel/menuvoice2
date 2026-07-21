import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCartesiaState, type CartesiaRotationState } from '../api/_cartesiaStatus.ts';
import { creditPeriod, getCartesiaCreditStatus, sumCreditUsage } from '../api/_cartesiaCredits.ts';
import { renderCartesiaEmailHtml, renderCartesiaText } from '../api/_morningData.ts';
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
      '2': {
        activeSince: '2026-07-14T12:00:00.000Z',
        lastSuccessAt: '2026-07-16T12:00:00.000Z',
        trackedCreditsUsed: 1250,
        creditTrackingStartedAt: '2026-07-14T12:00:00.000Z',
      },
    },
  };
  const result = summarizeCartesiaState(
    state,
    3,
    new Date('2026-07-16T12:00:00.000Z'),
    720,
    'redis',
    ['first@example.com', 'second@example.com', 'third@example.com'],
  );
  assert.equal(result.activeLabel, 'Key 2');
  assert.equal(result.activeEmail, 'second@example.com');
  assert.equal(result.keys[1].email, 'second@example.com');
  assert.equal(result.remainingAfterActive, 1);
  assert.equal(result.keys[0].status, 'exhausted');
  assert.equal(result.keys[2].status, 'available');
  assert.equal(result.keys[1].credits.state, 'tracked');
  assert.equal(result.keys[1].credits.used, 1250);
  assert.equal(result.keys[1].credits.remaining, 18750);
  assert.equal(result.keys[2].credits.remaining, 20000);
  assert.equal(result.projectedRunOutAt, '2026-07-27T12:00:00.000Z');
  const report = renderCartesiaText(result);
  assert.match(report, /Active: second@example.com \(Key 2\)/);
  assert.match(report, /second@example.com \(Key 2\) \| active \| estimated 18,750 credits left of 20,000/);
  const email = renderCartesiaEmailHtml(result, 'Arial,sans-serif');
  assert.match(email, /second@example.com \(Key 2\) is active/);
  assert.match(email, /18,750 credits left of 20,000/);
  assert.match(email, /Meet My Menu tracked estimate/);
  assert.equal(JSON.stringify(result).includes('sk_car'), false);
});

test('Cartesia billing period follows the configured monthly reset day', () => {
  const current = creditPeriod(new Date('2026-07-16T12:00:00.000Z'), 10);
  assert.equal(current.start.toISOString(), '2026-07-10T00:00:00.000Z');
  assert.equal(current.end.toISOString(), '2026-08-10T00:00:00.000Z');

  const previous = creditPeriod(new Date('2026-07-02T12:00:00.000Z'), 10);
  assert.equal(previous.start.toISOString(), '2026-06-10T00:00:00.000Z');
  assert.equal(previous.end.toISOString(), '2026-07-10T00:00:00.000Z');
});

test('Cartesia usage totals are summed without estimating missing data', () => {
  assert.equal(sumCreditUsage({ data: [{ credits: 1200 }, { credits: 980 }] }), 2180);
  assert.equal(sumCreditUsage({ data: [{ credits: 'bad' }] }), null);
  assert.equal(sumCreditUsage({}), null);
});

test('Cartesia credit status uses the admin usage API and configured allowance', async () => {
  const names = [
    'CARTESIA_ADMIN_API_KEY_9',
    'CARTESIA_MONTHLY_CREDITS_9',
    'CARTESIA_CREDIT_RESET_DAY_9',
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.CARTESIA_ADMIN_API_KEY_9 = 'sk_car_admin_test';
  process.env.CARTESIA_MONTHLY_CREDITS_9 = '20000';
  process.env.CARTESIA_CREDIT_RESET_DAY_9 = '10';
  let requested = '';
  try {
    const result = await getCartesiaCreditStatus(
      9,
      new Date('2026-07-16T12:00:00.000Z'),
      async (input) => {
        requested = String(input);
        return new Response(JSON.stringify({ data: [{ credits: 3500 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    );
    assert.equal(result.state, 'live');
    assert.equal(result.used, 3500);
    assert.equal(result.remaining, 16500);
    assert.match(requested, /usage\/credits/);
    assert.match(requested, /start_ts=2026-07-10/);
    assert.equal(JSON.stringify(result).includes('sk_car_admin_test'), false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
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

test('morning report sends only for a unique visitor or an explicit manual override', () => {
  assert.equal(shouldSendMorningReport({ totals: { users: 0 }, website: { sessions: 0 } }), false);
  assert.equal(shouldSendMorningReport({ totals: { users: 1 }, website: { sessions: 0 } }), true);
  assert.equal(shouldSendMorningReport({ totals: { users: 0 }, website: { sessions: 1 } }), true);
  assert.equal(shouldSendMorningReport({ totals: { users: 0 }, website: { sessions: 0 } }, true), true);
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
  assert.match(body, /Account email/);
  assert.match(body, /Credits left/);
  assert.match(body, /Balance source/);
  assert.match(body, /Each free key starts at 20,000 credits/);
  assert.ok(body.indexOf('<h2>Cartesia API keys</h2>') > body.indexOf('<h2>Failures</h2>'));
});
