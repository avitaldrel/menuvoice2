import { Redis } from '@upstash/redis';
import { getCartesiaCreditStatus, type CartesiaCreditStatus } from './_cartesiaCredits.js';

const STATE_KEY = 'menuvoice:cartesia:key-rotation:v1';
const DEFAULT_RECOVERY_HOURS = 30 * 24;
const DEFAULT_FREE_CREDITS = 20_000;

export interface CartesiaSlotState {
  activeSince?: string;
  lastSuccessAt?: string;
  exhaustedAt?: string;
  availableAt?: string;
  trackedCreditsUsed?: number;
  creditTrackingStartedAt?: string;
}

export interface CartesiaRotationState {
  version: 1;
  activeSlot: number | null;
  lastSwitchedAt: string | null;
  allExhaustedAt: string | null;
  slots: Record<string, CartesiaSlotState>;
}

export interface CartesiaKeyStatus {
  slot: number;
  label: string;
  email: string | null;
  status: 'active' | 'available' | 'exhausted';
  activeSince: string | null;
  lastSuccessAt: string | null;
  exhaustedAt: string | null;
  availableAt: string | null;
  credits: CartesiaCreditStatus;
}

export interface CartesiaStatus {
  configured: number;
  activeSlot: number | null;
  activeLabel: string | null;
  activeEmail: string | null;
  activeSince: string | null;
  lastSwitchedAt: string | null;
  allExhausted: boolean;
  allExhaustedAt: string | null;
  remainingAfterActive: number;
  firstReturnsAt: string | null;
  projectedRunOutAt: string | null;
  projectionBasis: string | null;
  recoveryHours: number;
  storage: 'redis' | 'memory';
  keys: CartesiaKeyStatus[];
}

function emptyState(): CartesiaRotationState {
  return { version: 1, activeSlot: null, lastSwitchedAt: null, allExhaustedAt: null, slots: {} };
}

function redisFromEnv(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function recoveryHours(): number {
  const value = Number(process.env.CARTESIA_KEY_RECOVERY_HOURS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RECOVERY_HOURS;
}

export function cartesiaConfiguredKeyCount(): number {
  const keys: string[] = [];
  const add = (value?: string) => {
    if (!value) return;
    for (const part of value.split(',')) if (part.trim()) keys.push(part.trim());
  };
  add(process.env.CARTESIA_API_KEYS);
  add(process.env.CARTESIA_API_KEY);
  for (let i = 1; i <= 10; i += 1) add(process.env[`CARTESIA_API_KEY_${i}`]);
  return new Set(keys).size;
}

function parseState(raw: unknown): CartesiaRotationState {
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return emptyState(); }
  }
  if (!raw || typeof raw !== 'object') return emptyState();
  const value = raw as Partial<CartesiaRotationState>;
  return {
    version: 1,
    activeSlot: typeof value.activeSlot === 'number' ? value.activeSlot : null,
    lastSwitchedAt: typeof value.lastSwitchedAt === 'string' ? value.lastSwitchedAt : null,
    allExhaustedAt: typeof value.allExhaustedAt === 'string' ? value.allExhaustedAt : null,
    slots: value.slots && typeof value.slots === 'object' ? value.slots : {},
  };
}

function memoryHost(): typeof globalThis & { __meetMyMenuCartesiaRotation?: CartesiaRotationState } {
  return globalThis as typeof globalThis & { __meetMyMenuCartesiaRotation?: CartesiaRotationState };
}

async function readState(): Promise<{ state: CartesiaRotationState; redis: Redis | null }> {
  const redis = redisFromEnv();
  if (redis) {
    try { return { state: parseState(await redis.get(STATE_KEY)), redis }; }
    catch (error) { console.warn('[Meet My Menu AI] Cartesia rotation state read failed:', error); }
  }
  return { state: parseState(memoryHost().__meetMyMenuCartesiaRotation), redis: null };
}

async function writeState(state: CartesiaRotationState, redis: Redis | null): Promise<void> {
  memoryHost().__meetMyMenuCartesiaRotation = state;
  if (!redis) return;
  try { await redis.set(STATE_KEY, state); }
  catch (error) { console.warn('[Meet My Menu AI] Cartesia rotation state write failed:', error); }
}

export async function recordCartesiaSuccess(
  slot: number,
  now = new Date(),
  estimatedCredits = 0,
): Promise<void> {
  const { state, redis } = await readState();
  const at = now.toISOString();
  const changed = state.activeSlot !== slot;
  const slotState = state.slots[String(slot)] ?? {};

  if (changed) {
    if (state.activeSlot !== null || Object.values(state.slots).some((s) => s.exhaustedAt)) {
      state.lastSwitchedAt = at;
    }
    slotState.activeSince = at;
  } else if (!slotState.activeSince) {
    slotState.activeSince = at;
  }

  const recovered = !!slotState.availableAt && Date.parse(slotState.availableAt) <= now.getTime();
  if (recovered) {
    delete slotState.availableAt;
    delete slotState.exhaustedAt;
    slotState.trackedCreditsUsed = 0;
    slotState.creditTrackingStartedAt = at;
  }
  slotState.lastSuccessAt = at;
  if (estimatedCredits > 0) {
    slotState.creditTrackingStartedAt ??= at;
    slotState.trackedCreditsUsed = Math.max(0, slotState.trackedCreditsUsed ?? 0) + estimatedCredits;
  }
  state.slots[String(slot)] = slotState;
  state.activeSlot = slot;
  state.allExhaustedAt = null;
  await writeState(state, redis);
}

export async function recordCartesiaExhausted(slot: number, now = new Date()): Promise<void> {
  const { state, redis } = await readState();
  const at = now.toISOString();
  const availableAt = new Date(now.getTime() + recoveryHours() * 3_600_000).toISOString();
  state.slots[String(slot)] = { ...state.slots[String(slot)], exhaustedAt: at, availableAt };
  await writeState(state, redis);
}

export async function recordAllCartesiaExhausted(now = new Date()): Promise<void> {
  const { state, redis } = await readState();
  state.activeSlot = null;
  state.allExhaustedAt = state.allExhaustedAt ?? now.toISOString();
  await writeState(state, redis);
}

export function summarizeCartesiaState(
  state: CartesiaRotationState,
  configured: number,
  now = new Date(),
  configuredRecoveryHours = recoveryHours(),
  storage: 'redis' | 'memory' = 'memory',
  emails: Array<string | null> = [],
  credits: CartesiaCreditStatus[] = [],
  creditLimits: number[] = [],
): CartesiaStatus {
  const nowMs = now.getTime();
  const keys: CartesiaKeyStatus[] = [];
  for (let slot = 1; slot <= configured; slot += 1) {
    const s = state.slots[String(slot)] ?? {};
    const unavailable = !!s.availableAt && Date.parse(s.availableAt) > nowMs;
    const active = state.activeSlot === slot && !unavailable;
    const rotationStatus = active ? 'active' : unavailable ? 'exhausted' : 'available';
    const configuredCredits = credits[slot - 1];
    const limit = Number.isFinite(creditLimits[slot - 1]) && creditLimits[slot - 1] > 0
      ? creditLimits[slot - 1]
      : DEFAULT_FREE_CREDITS;
    const trackedUsed = Math.max(0, s.trackedCreditsUsed ?? 0);
    const trackedCredits: CartesiaCreditStatus = {
      state: 'tracked',
      used: trackedUsed,
      limit,
      remaining: unavailable ? 0 : Math.max(0, limit - trackedUsed),
      periodStart: s.creditTrackingStartedAt ?? null,
      periodEnd: null,
      checkedAt: s.lastSuccessAt ?? null,
      message: 'Estimated from successful Meet My Menu AI TTS requests. Cartesia may vary slightly.',
    };
    keys.push({
      slot,
      label: `Key ${slot}`,
      email: emails[slot - 1] ?? null,
      status: rotationStatus,
      activeSince: s.activeSince ?? null,
      lastSuccessAt: s.lastSuccessAt ?? null,
      exhaustedAt: s.exhaustedAt ?? null,
      availableAt: unavailable ? s.availableAt ?? null : null,
      credits: configuredCredits?.state === 'live' ? configuredCredits : trackedCredits,
    });
  }

  const exhausted = keys.filter((k) => k.status === 'exhausted');
  const active = keys.find((k) => k.status === 'active') ?? null;
  const allExhausted = configured > 0 && exhausted.length === configured;
  const remainingAfterActive = keys.filter((k) => k.status === 'available').length;
  const firstReturnsAt = exhausted
    .map((k) => k.availableAt)
    .filter((v): v is string => !!v)
    .sort()[0] ?? null;

  const completedDurations = keys
    .map((k) => k.activeSince && k.exhaustedAt ? Date.parse(k.exhaustedAt) - Date.parse(k.activeSince) : NaN)
    .filter((ms) => Number.isFinite(ms) && ms >= 3_600_000);
  let projectedRunOutAt: string | null = null;
  let projectionBasis: string | null = null;
  if (active?.activeSince && completedDurations.length) {
    const average = completedDurations.reduce((sum, ms) => sum + ms, 0) / completedDurations.length;
    projectedRunOutAt = new Date(Date.parse(active.activeSince) + average).toISOString();
    projectionBasis = `${completedDurations.length} completed key run${completedDurations.length === 1 ? '' : 's'}`;
  }

  return {
    configured,
    activeSlot: active?.slot ?? null,
    activeLabel: active?.label ?? null,
    activeEmail: active?.email ?? null,
    activeSince: active?.activeSince ?? null,
    lastSwitchedAt: state.lastSwitchedAt,
    allExhausted,
    allExhaustedAt: allExhausted ? state.allExhaustedAt : null,
    remainingAfterActive,
    firstReturnsAt,
    projectedRunOutAt,
    projectionBasis,
    recoveryHours: configuredRecoveryHours,
    storage,
    keys,
  };
}

export async function getCartesiaStatus(configured: number): Promise<CartesiaStatus> {
  const { state, redis } = await readState();
  const now = new Date();
  const emails = Array.from({ length: configured }, (_, index) =>
    process.env[`CARTESIA_API_KEY_EMAIL_${index + 1}`]?.trim() || null,
  );
  const credits = await Promise.all(
    Array.from({ length: configured }, (_, index) => getCartesiaCreditStatus(index + 1, now)),
  );
  const creditLimits = Array.from({ length: configured }, (_, index) => {
    const configuredLimit = Number(process.env[`CARTESIA_MONTHLY_CREDITS_${index + 1}`]);
    return Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : DEFAULT_FREE_CREDITS;
  });
  return summarizeCartesiaState(
    state,
    configured,
    now,
    recoveryHours(),
    redis ? 'redis' : 'memory',
    emails,
    credits,
    creditLimits,
  );
}
