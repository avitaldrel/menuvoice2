// Burst limiting for the expensive routes (AI, search, transcription, speech).
//
// The job here is to stop runaway cost from a stuck control, a rapid repeated
// tap, or abuse — NOT to ration MenuVoice. A blind diner sitting at a table
// reading two menus and holding a long conversation must never hit a wall, so
// the limits are deliberately generous and the penalty is a cool-down measured
// in seconds, never a lockout.
//
// Design notes:
//   - The decision logic is pure (evaluateBucket) so it can be unit-tested
//     without a network or a clock.
//   - Storage is Vercel KV when configured, with an in-process fallback. Any
//     storage error FAILS OPEN: a limiter that breaks the app is worse than no
//     limiter on a product people rely on to order dinner.
//   - Identical back-to-back requests are treated as an accidental repeat and
//     get a very short cool-down, which is the stuck-button case.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface RateLimitRule {
  /** Requests allowed inside the window. */
  limit: number;
  /** Rolling window length in milliseconds. */
  windowMs: number;
  /** Identical repeat inside this many ms counts as an accidental double-fire. */
  dedupeMs: number;
}

// Generous, route-specific budgets, sized against real use rather than a tidy
// number: a diner can hold a five-minute conversation at a turn every couple of
// seconds and still not come close. A stuck control fires many times per
// SECOND, so even these ceilings catch runaway cost within moments.
//
// Speech gets the largest budget because one assistant reply can be several
// spoken chunks, and transcription tracks the user's utterances one for one.
export const ROUTE_LIMITS: Record<string, RateLimitRule> = {
  'find-menu':     { limit: 20,  windowMs: 5 * 60_000, dedupeMs: 3_000 },
  'menu-from-url': { limit: 20,  windowMs: 5 * 60_000, dedupeMs: 3_000 },
  'chat':          { limit: 150, windowMs: 5 * 60_000, dedupeMs: 1_500 },
  'transcribe':    { limit: 150, windowMs: 5 * 60_000, dedupeMs: 0 },
  'tts':           { limit: 300, windowMs: 5 * 60_000, dedupeMs: 0 },
};

export interface Bucket {
  /** Timestamps of recent requests, oldest first. */
  hits: number[];
  lastFingerprint?: string;
  lastAt?: number;
}

export interface RateDecision {
  allowed: boolean;
  /** Seconds the caller should wait. Always >= 1 when blocked. */
  retryAfterSec: number;
  reason?: 'duplicate' | 'burst';
}

export const EMPTY_BUCKET: Bucket = { hits: [] };

/** Drop hits that have aged out of the window. */
export function pruneHits(hits: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return hits.filter((t) => t > cutoff);
}

/**
 * Decide whether one request may proceed, and return the bucket to store.
 * Pure: no clock, no storage, no side effects.
 */
export function evaluateBucket(
  bucket: Bucket,
  rule: RateLimitRule,
  now: number,
  fingerprint?: string,
): { decision: RateDecision; next: Bucket } {
  const hits = pruneHits(bucket.hits ?? [], now, rule.windowMs);

  // An identical request moments after the last one is a double-fire, not a
  // person asking twice. Bounce it cheaply without spending the budget.
  if (
    rule.dedupeMs > 0 &&
    fingerprint &&
    bucket.lastFingerprint === fingerprint &&
    typeof bucket.lastAt === 'number' &&
    now - bucket.lastAt < rule.dedupeMs
  ) {
    const waitMs = rule.dedupeMs - (now - bucket.lastAt);
    return {
      decision: { allowed: false, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)), reason: 'duplicate' },
      // Do NOT record the duplicate: a stuck button must not burn the budget.
      next: { hits, lastFingerprint: fingerprint, lastAt: bucket.lastAt },
    };
  }

  if (hits.length >= rule.limit) {
    // Wait until the oldest hit leaves the window — seconds or a minute or two,
    // never a lockout, and it clears itself without any intervention.
    const oldest = hits[0];
    const waitMs = Math.max(0, oldest + rule.windowMs - now);
    return {
      decision: { allowed: false, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)), reason: 'burst' },
      next: { hits, lastFingerprint: bucket.lastFingerprint, lastAt: bucket.lastAt },
    };
  }

  return {
    decision: { allowed: true, retryAfterSec: 0 },
    next: { hits: [...hits, now], lastFingerprint: fingerprint, lastAt: now },
  };
}

/** Spoken-friendly wait, e.g. "a few seconds" / "about 2 minutes". */
export function retryPhrase(seconds: number): string {
  if (seconds <= 10) return 'a few seconds';
  if (seconds < 60) return `about ${Math.ceil(seconds / 10) * 10} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? 'about a minute' : `about ${minutes} minutes`;
}

/** The message a user actually hears. Plain, calm, and it names the wait. */
export function rateLimitMessage(decision: RateDecision): string {
  const wait = retryPhrase(decision.retryAfterSec);
  if (decision.reason === 'duplicate') {
    return `I am still working on that same request. Give me ${wait} and try again.`;
  }
  return `That is a lot of requests at once, so I need ${wait} before the next one. Nothing is lost, and you can carry on after that.`;
}

/** Stable per-caller key: the app's session when present, else the client IP. */
export function identityOf(req: VercelRequest): string {
  const header = req.headers['x-menuvoice-session'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const fromBody =
    req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>).session_id : undefined;
  const session = (fromHeader || (typeof fromBody === 'string' ? fromBody : '') || '').trim();
  if (session) return `sid:${session.slice(0, 80)}`;

  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd ?? '';
  const ip = raw.split(',')[0].trim() || 'unknown';
  return `ip:${ip}`;
}

/**
 * Short, stable hash of a payload, used only to spot identical repeats.
 * Plain arithmetic so the module runs unchanged on the Node and Edge runtimes
 * (api/chat.ts is an Edge function and has no node:crypto).
 */
export function hashPayload(payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const text = payload.slice(0, 4000);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16) + h2.toString(16)).padStart(16, '0');
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
  } catch {
    return '';
  }
}

/** Fingerprint for a Node-runtime request. */
export function fingerprintOf(req: VercelRequest): string {
  return hashPayload(safeStringify(req.body));
}

// ── Storage ────────────────────────────────────────────────────────────────
// KV keeps buckets consistent across serverless instances. Without it we fall
// back to per-instance memory, which still catches the stuck-button case.

const memory = new Map<string, Bucket>();

async function readBucket(key: string): Promise<Bucket> {
  try {
    const { kv } = await import('@vercel/kv');
    const stored = (await kv.get(key)) as Bucket | null;
    if (stored && Array.isArray(stored.hits)) return stored;
    return { ...EMPTY_BUCKET };
  } catch {
    return memory.get(key) ?? { ...EMPTY_BUCKET };
  }
}

async function writeBucket(key: string, bucket: Bucket, windowMs: number): Promise<void> {
  memory.set(key, bucket);
  try {
    const { kv } = await import('@vercel/kv');
    await kv.set(key, bucket, { ex: Math.ceil(windowMs / 1000) + 60 });
  } catch {
    // memory copy above is the fallback
  }
}

/**
 * Enforce the limit for `route`. Returns true when the request may proceed;
 * when it returns false a 429 has already been sent.
 *
 * Fails open on any unexpected error.
 */
export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  route: keyof typeof ROUTE_LIMITS,
): Promise<boolean> {
  const rule = ROUTE_LIMITS[route];
  if (!rule) return true;
  try {
    const key = `rl:${route}:${identityOf(req)}`;
    const bucket = await readBucket(key);
    const now = Date.now();
    const { decision, next } = evaluateBucket(bucket, rule, now, fingerprintOf(req));
    await writeBucket(key, next, rule.windowMs);

    if (decision.allowed) return true;

    res.setHeader('Retry-After', String(decision.retryAfterSec));
    res.status(429).json({
      error: rateLimitMessage(decision),
      retryAfter: decision.retryAfterSec,
    });
    return false;
  } catch (e) {
    console.warn('[MenuVoice] rate limit check failed, allowing request:', e);
    return true;
  }
}

/**
 * Edge-runtime counterpart for api/chat.ts. Returns a 429 Response when the
 * caller must wait, or null when the request may proceed. `body` is passed in
 * because an Edge request body can only be read once.
 *
 * Fails open on any unexpected error.
 */
export async function enforceRateLimitEdge(
  req: Request,
  route: keyof typeof ROUTE_LIMITS,
  body: unknown,
): Promise<Response | null> {
  const rule = ROUTE_LIMITS[route];
  if (!rule) return null;
  try {
    const session =
      (req.headers.get('x-menuvoice-session') ??
        (body && typeof body === 'object'
          ? String((body as Record<string, unknown>).session_id ?? '')
          : '')).trim();
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const identity = session ? `sid:${session.slice(0, 80)}` : `ip:${ip}`;

    const key = `rl:${route}:${identity}`;
    const bucket = await readBucket(key);
    const now = Date.now();
    const { decision, next } = evaluateBucket(bucket, rule, now, hashPayload(safeStringify(body)));
    await writeBucket(key, next, rule.windowMs);

    if (decision.allowed) return null;

    return Response.json(
      { error: rateLimitMessage(decision), retryAfter: decision.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(decision.retryAfterSec) } },
    );
  } catch (e) {
    console.warn('[MenuVoice] rate limit check failed, allowing request:', e);
    return null;
  }
}
