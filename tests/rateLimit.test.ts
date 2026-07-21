// Burst limiting for expensive routes (bug #3).
// The limits exist to stop stuck controls and runaway cost, NOT to ration the
// app, so these tests pin down that ordinary prolonged use never trips them and
// that any block clears itself in seconds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTE_LIMITS,
  EMPTY_BUCKET,
  evaluateBucket,
  pruneHits,
  retryPhrase,
  rateLimitMessage,
  hashPayload,
  type Bucket,
  type RateLimitRule,
} from '../api/_rateLimit.ts';

const rule: RateLimitRule = { limit: 5, windowMs: 60_000, dedupeMs: 2_000 };

/** Replay `count` requests spaced `gapMs` apart, returning the final state. */
function replay(count: number, gapMs: number, r: RateLimitRule, startAt = 1_000_000) {
  let bucket: Bucket = { ...EMPTY_BUCKET };
  let blocked = 0;
  let now = startAt;
  for (let i = 0; i < count; i++) {
    // Distinct fingerprints: these are genuinely different requests.
    const { decision, next } = evaluateBucket(bucket, r, now, `fp-${i}`);
    if (!decision.allowed) blocked++;
    bucket = next;
    now += gapMs;
  }
  return { bucket, blocked, endedAt: now };
}

test('pruneHits drops only entries older than the window', () => {
  const now = 100_000;
  const hits = [now - 90_000, now - 30_000, now - 1_000];
  assert.deepEqual(pruneHits(hits, now, 60_000), [now - 30_000, now - 1_000]);
});

test('normal sustained use is never blocked', () => {
  // A real conversation on the chat route: a turn every 4 seconds for 5 minutes.
  const chat = ROUTE_LIMITS['chat'];
  const turns = Math.floor((5 * 60_000) / 4_000); // 75 turns
  const { blocked } = replay(turns, 4_000, chat);
  assert.equal(blocked, 0, 'a five-minute conversation must not be rate limited');
});

test('reading several menus in a sitting is never blocked', () => {
  // Four menus read a minute apart, which is a realistic table session.
  const find = ROUTE_LIMITS['find-menu'];
  const { blocked } = replay(4, 60_000, find);
  assert.equal(blocked, 0);
});

test('an accidental rapid repeat is bounced without spending the budget', () => {
  const bucket: Bucket = { ...EMPTY_BUCKET };
  const first = evaluateBucket(bucket, rule, 1_000, 'same-request');
  assert.equal(first.decision.allowed, true);
  assert.equal(first.next.hits.length, 1);

  // The exact same request 300ms later: a double-fire, not a second question.
  const second = evaluateBucket(first.next, rule, 1_300, 'same-request');
  assert.equal(second.decision.allowed, false);
  assert.equal(second.decision.reason, 'duplicate');
  // Crucially the duplicate did NOT consume budget.
  assert.equal(second.next.hits.length, 1, 'a stuck button must not burn the allowance');
});

test('the same request again after the dedupe window is allowed', () => {
  const first = evaluateBucket({ ...EMPTY_BUCKET }, rule, 1_000, 'same-request');
  const later = evaluateBucket(first.next, rule, 1_000 + rule.dedupeMs + 1, 'same-request');
  assert.equal(later.decision.allowed, true, 'asking the same thing again later is legitimate');
});

test('a genuine burst past the limit is blocked with a short wait', () => {
  const { bucket, blocked } = replay(5, 100, rule);
  assert.equal(blocked, 0, 'the first five fit inside the limit');

  const sixth = evaluateBucket(bucket, rule, 1_000_500, 'fp-extra');
  assert.equal(sixth.decision.allowed, false);
  assert.equal(sixth.decision.reason, 'burst');
  assert.ok(sixth.decision.retryAfterSec >= 1);
  // A cool-down, never a lockout: it can never exceed the window itself.
  assert.ok(sixth.decision.retryAfterSec <= rule.windowMs / 1000);
});

test('the block clears itself once the window rolls past', () => {
  const { bucket } = replay(5, 100, rule);
  const blockedAt = 1_000_500;
  assert.equal(evaluateBucket(bucket, rule, blockedAt, 'x').decision.allowed, false);

  // Wait out the window and the same caller is served again, with no
  // intervention and nothing permanently held against them.
  const afterWindow = 1_000_000 + rule.windowMs + 1;
  const recovered = evaluateBucket(bucket, rule, afterWindow, 'y');
  assert.equal(recovered.decision.allowed, true, 'a blind user must never be permanently blocked');
});

test('retry guidance is spoken in plain language', () => {
  assert.equal(retryPhrase(3), 'a few seconds');
  assert.equal(retryPhrase(45), 'about 50 seconds');
  assert.equal(retryPhrase(60), 'about a minute');
  assert.equal(retryPhrase(150), 'about 3 minutes');
});

test('the message names the wait and never sounds like a punishment', () => {
  const msg = rateLimitMessage({ allowed: false, retryAfterSec: 30, reason: 'burst' });
  assert.match(msg, /about 30 seconds/);
  assert.match(msg, /Nothing is lost/);

  const dup = rateLimitMessage({ allowed: false, retryAfterSec: 2, reason: 'duplicate' });
  assert.match(dup, /same request/);
});

test('every expensive route has a generous, finite budget', () => {
  for (const [route, r] of Object.entries(ROUTE_LIMITS)) {
    assert.ok(r.limit >= 15, `${route} budget should be generous`);
    assert.ok(r.windowMs > 0 && Number.isFinite(r.windowMs), `${route} needs a real window`);
  }
});

test('hashPayload is stable, differs on change, and tolerates junk', () => {
  assert.equal(hashPayload('{"a":1}'), hashPayload('{"a":1}'));
  assert.notEqual(hashPayload('{"a":1}'), hashPayload('{"a":2}'));
  assert.equal(typeof hashPayload(''), 'string');
});
