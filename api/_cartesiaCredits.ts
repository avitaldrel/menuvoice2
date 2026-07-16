const CARTESIA_VERSION = '2026-03-01';
const CACHE_MS = 5 * 60 * 1000;

export type CartesiaCreditState = 'live' | 'missing-admin-key' | 'missing-billing-settings' | 'error';

export interface CartesiaCreditStatus {
  state: CartesiaCreditState;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  checkedAt: string | null;
  message: string | null;
}

interface UsageBucket {
  credits?: unknown;
}

interface UsageResponse {
  data?: UsageBucket[];
}

interface CreditCacheEntry {
  expiresAt: number;
  value: CartesiaCreditStatus;
}

function cacheHost(): typeof globalThis & { __menuvoiceCartesiaCreditCache?: Map<number, CreditCacheEntry> } {
  return globalThis as typeof globalThis & { __menuvoiceCartesiaCreditCache?: Map<number, CreditCacheEntry> };
}

function cache(): Map<number, CreditCacheEntry> {
  const host = cacheHost();
  host.__menuvoiceCartesiaCreditCache ??= new Map();
  return host.__menuvoiceCartesiaCreditCache;
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function utcDateForReset(year: number, month: number, resetDay: number): Date {
  return new Date(Date.UTC(year, month, Math.min(resetDay, daysInUtcMonth(year, month))));
}

export function creditPeriod(now: Date, resetDay: number): { start: Date; end: Date } {
  const day = Math.max(1, Math.min(31, Math.trunc(resetDay)));
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let start = utcDateForReset(year, month, day);
  if (start.getTime() > now.getTime()) {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    start = utcDateForReset(year, month, day);
  }
  let endYear = year;
  let endMonth = month + 1;
  if (endMonth > 11) { endMonth = 0; endYear += 1; }
  return { start, end: utcDateForReset(endYear, endMonth, day) };
}

export function sumCreditUsage(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as UsageResponse).data;
  if (!Array.isArray(data)) return null;
  let total = 0;
  for (const bucket of data) {
    const credits = Number(bucket?.credits);
    if (!Number.isFinite(credits)) return null;
    total += credits;
  }
  return total;
}

function missing(state: CartesiaCreditState, message: string, limit: number | null = null): CartesiaCreditStatus {
  return {
    state,
    used: null,
    limit,
    remaining: null,
    periodStart: null,
    periodEnd: null,
    checkedAt: null,
    message,
  };
}

export async function getCartesiaCreditStatus(
  slot: number,
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<CartesiaCreditStatus> {
  const adminKey = process.env[`CARTESIA_ADMIN_API_KEY_${slot}`]?.trim();
  if (!adminKey) return missing('missing-admin-key', 'Add the Cartesia admin API key for this account.');

  const limit = Number(process.env[`CARTESIA_MONTHLY_CREDITS_${slot}`]);
  const resetDay = Number(process.env[`CARTESIA_CREDIT_RESET_DAY_${slot}`]);
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(resetDay) || resetDay < 1 || resetDay > 31) {
    return missing(
      'missing-billing-settings',
      'Add the monthly credit allowance and monthly reset day for this account.',
      Number.isFinite(limit) && limit > 0 ? limit : null,
    );
  }

  const cached = cache().get(slot);
  if (cached && cached.expiresAt > now.getTime()) return cached.value;

  const period = creditPeriod(now, resetDay);
  const url = new URL('https://api.cartesia.ai/usage/credits');
  url.searchParams.set('start_ts', period.start.toISOString());
  url.searchParams.set('end_ts', now.toISOString());

  let value: CartesiaCreditStatus;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${adminKey}`,
        'Cartesia-Version': CARTESIA_VERSION,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      value = missing('error', `Cartesia usage request failed with status ${response.status}.`, limit);
    } else {
      const used = sumCreditUsage(await response.json());
      if (used === null) {
        value = missing('error', 'Cartesia returned usage data in an unexpected format.', limit);
      } else {
        value = {
          state: 'live',
          used,
          limit,
          remaining: Math.max(0, limit - used),
          periodStart: period.start.toISOString(),
          periodEnd: period.end.toISOString(),
          checkedAt: now.toISOString(),
          message: null,
        };
      }
    }
  } catch {
    value = missing('error', 'Cartesia usage could not be reached.', limit);
  }

  cache().set(slot, { expiresAt: now.getTime() + CACHE_MS, value });
  return value;
}

