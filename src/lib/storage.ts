// Local persistence with localStorage + cloud sync via /api/sync.
// SavedRestaurant carries its own id + capturedAt so a future V2 "shared menus
// across users" feature needs no migration.

import {
  type CorrectionType,
  type MenuCorrection,
  type MenuFreshness,
  type ParsedMenu,
  type RestaurantSource,
  type SavedRestaurant,
  type UserProfile,
  EMPTY_PROFILE,
} from '../types';
import { track } from './telemetry';
import { buildFreshnessMeta, sanitizeParsedMenu } from './menuData';

const PROFILE_KEY = 'menuvoice.profile.v1';
const SAVED_KEY = 'menuvoice.savedRestaurants.v1';

// ── Cloud sync ────────────────────────────────────────────────────────────────

async function pushToCloud(profile: UserProfile, restaurants: SavedRestaurant[]) {
  if (!profile.email) return;
  try {
    const body = JSON.stringify({ email: profile.email, profile, restaurants });
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    track('sync', 'push', {
      outcome: 'success',
      metadata: { bytes: body.length, restaurant_count: restaurants.length },
    });
  } catch {
    track('sync', 'push', { outcome: 'failure' });
    // offline — local save already happened, cloud will be stale until next push
  }
}

export async function loadFromCloud(email: string): Promise<{ profile: UserProfile; restaurants: SavedRestaurant[] } | null> {
  try {
    const res = await fetch(`/api/sync?email=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;
    track('sync', 'pull', {
      outcome: 'success',
      metadata: { restaurant_count: (data.restaurants ?? []).length },
    });
    return { profile: data.profile ?? null, restaurants: data.restaurants ?? [] };
  } catch {
    return null;
  }
}

// Writes cloud data into localStorage so the rest of the app picks it up normally.
export async function restoreFromCloud(email: string): Promise<UserProfile | null> {
  const cloud = await loadFromCloud(email);
  if (!cloud?.profile) return null;
  const merged: UserProfile = { ...EMPTY_PROFILE, ...cloud.profile, email };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
  localStorage.setItem(SAVED_KEY, JSON.stringify(cloud.restaurants ?? []));
  return merged;
}

export async function loadProfile(): Promise<UserProfile> {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    return { ...EMPTY_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  const restaurants = await loadSavedRestaurants();
  pushToCloud(profile, restaurants);
}

export async function loadSavedRestaurants(): Promise<SavedRestaurant[]> {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => sanitizeSavedRestaurant(value))
      .filter((value): value is SavedRestaurant => !!value);
  } catch {
    return [];
  }
}

function sanitizeSavedRestaurant(raw: unknown): SavedRestaurant | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const id = typeof entry.id === 'string' ? entry.id : '';
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const capturedAt = typeof entry.capturedAt === 'string' ? entry.capturedAt : new Date().toISOString();
  if (!id || !name) return null;

  const corrections = Array.isArray(entry.corrections)
    ? entry.corrections
        .map((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
          const correction = value as Record<string, unknown>;
          const type = correction.type;
          if (
            type !== 'wrong_price' &&
            type !== 'missing_item' &&
            type !== 'not_on_menu_anymore' &&
            type !== 'allergen_unclear'
          ) {
            return null;
          }
          return {
            id: typeof correction.id === 'string' ? correction.id : `corr-${Date.now()}`,
            type: type as CorrectionType,
            createdAt: typeof correction.createdAt === 'string' ? correction.createdAt : capturedAt,
            itemName: typeof correction.itemName === 'string' ? correction.itemName : undefined,
            note: typeof correction.note === 'string' ? correction.note : undefined,
          } satisfies MenuCorrection;
        })
        .filter((value): value is NonNullable<typeof value> => !!value)
    : [];

  const source =
    entry.source === 'url' || entry.source === 'find' || entry.source === 'photo'
      ? entry.source
      : typeof entry.sourceUrl === 'string'
        ? 'url'
        : undefined;

  return {
    id,
    name,
    menu: sanitizeParsedMenu(entry.menu),
    capturedAt,
    sourceUrl: typeof entry.sourceUrl === 'string' ? entry.sourceUrl : undefined,
    source,
    freshness: entry.freshness && typeof entry.freshness === 'object' && !Array.isArray(entry.freshness)
      ? {
          source: ((entry.freshness as Record<string, unknown>).source === 'url' ||
            (entry.freshness as Record<string, unknown>).source === 'find' ||
            (entry.freshness as Record<string, unknown>).source === 'photo'
              ? (entry.freshness as Record<string, unknown>).source
              : source ?? 'photo') as RestaurantSource,
          firstSavedAt: typeof (entry.freshness as Record<string, unknown>).firstSavedAt === 'string'
            ? ((entry.freshness as Record<string, unknown>).firstSavedAt as string)
            : capturedAt,
          lastImportedAt: typeof (entry.freshness as Record<string, unknown>).lastImportedAt === 'string'
            ? ((entry.freshness as Record<string, unknown>).lastImportedAt as string)
            : capturedAt,
          correctionCount: Number.isFinite((entry.freshness as Record<string, unknown>).correctionCount as number)
            ? Math.max(0, Math.round((entry.freshness as Record<string, unknown>).correctionCount as number))
            : corrections.length,
          missingPriceCount: Number.isFinite((entry.freshness as Record<string, unknown>).missingPriceCount as number)
            ? Math.max(0, Math.round((entry.freshness as Record<string, unknown>).missingPriceCount as number))
            : 0,
          unknownAllergenItemCount: Number.isFinite((entry.freshness as Record<string, unknown>).unknownAllergenItemCount as number)
            ? Math.max(0, Math.round((entry.freshness as Record<string, unknown>).unknownAllergenItemCount as number))
            : 0,
          needsUserCheckCount: Number.isFinite((entry.freshness as Record<string, unknown>).needsUserCheckCount as number)
            ? Math.max(0, Math.round((entry.freshness as Record<string, unknown>).needsUserCheckCount as number))
            : 0,
          lastCorrectionAt: typeof (entry.freshness as Record<string, unknown>).lastCorrectionAt === 'string'
            ? ((entry.freshness as Record<string, unknown>).lastCorrectionAt as string)
            : corrections[corrections.length - 1]?.createdAt,
        }
      : undefined,
    corrections,
  };
}

function trySetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: any) {
    const isQuota = e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014;
    if (!isQuota) throw e;
    track('error', 'storage_quota', { metadata: { key } });
    // Storage full — drop oldest saved restaurants one at a time until it fits.
    try {
      let trimmed = JSON.parse(value) as SavedRestaurant[];
      while (trimmed.length > 1) {
        trimmed = trimmed.slice(0, -1);
        try {
          localStorage.setItem(key, JSON.stringify(trimmed));
          return;
        } catch {}
      }
    } catch {}
    throw new Error('Storage is full. Delete some saved restaurants to free up space.');
  }
}

export async function saveRestaurant(
  name: string,
  menu: ParsedMenu,
  options?: { sourceUrl?: string; source?: RestaurantSource },
): Promise<SavedRestaurant> {
  const list = await loadSavedRestaurants();
  const cleanMenu = sanitizeParsedMenu(menu);
  const nowIso = new Date().toISOString();
  const prior = list.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
  const source = options?.source ?? prior?.source ?? 'photo';
  const entry: SavedRestaurant = {
    id: prior?.id ?? `r-${Date.now()}`,
    name: name.trim() || 'Unnamed restaurant',
    menu: cleanMenu,
    capturedAt: nowIso,
    ...(options?.sourceUrl ? { sourceUrl: options.sourceUrl } : prior?.sourceUrl ? { sourceUrl: prior.sourceUrl } : {}),
    source,
    corrections: prior?.corrections ?? [],
    freshness: buildFreshnessMeta(source, cleanMenu, nowIso, prior),
  };
  const filtered = list.filter((r) => r.name.toLowerCase() !== entry.name.toLowerCase());
  filtered.unshift(entry);
  trySetItem(SAVED_KEY, JSON.stringify(filtered));
  track('restaurant', 'saved', { content: { id: entry.id, name: entry.name } });
  const profile = await loadProfile();
  pushToCloud(profile, filtered);
  return entry;
}

export async function deleteRestaurant(id: string): Promise<void> {
  const list = await loadSavedRestaurants();
  const updated = list.filter((r) => r.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
  track('restaurant', 'deleted', { content: { id } });
  const profile = await loadProfile();
  pushToCloud(profile, updated);
}

export async function getSavedRestaurant(id: string): Promise<SavedRestaurant | null> {
  const list = await loadSavedRestaurants();
  return list.find((restaurant) => restaurant.id === id) ?? null;
}

export async function recordRestaurantCorrection(
  restaurantId: string,
  input: { type: CorrectionType; itemName?: string; note?: string },
): Promise<SavedRestaurant | null> {
  const list = await loadSavedRestaurants();
  const index = list.findIndex((restaurant) => restaurant.id === restaurantId);
  if (index < 0) return null;

  const nowIso = new Date().toISOString();
  const current = list[index];
  const correction: MenuCorrection = {
    id: `corr-${Date.now()}`,
    type: input.type,
    createdAt: nowIso,
    itemName: input.itemName?.trim() || undefined,
    note: input.note?.trim() || undefined,
  };
  const baseFreshness: MenuFreshness =
    current.freshness ?? buildFreshnessMeta(current.source ?? 'photo', current.menu, current.capturedAt, current);
  const updated: SavedRestaurant = {
    ...current,
    corrections: [...(current.corrections ?? []), correction],
    freshness: {
      ...baseFreshness,
      source: baseFreshness.source,
      correctionCount: (current.corrections?.length ?? 0) + 1,
      lastCorrectionAt: nowIso,
    },
  };
  const next = [...list];
  next[index] = updated;
  trySetItem(SAVED_KEY, JSON.stringify(next));
  track('menu_correction', 'recorded', {
    outcome: 'success',
    content: { restaurantId, type: correction.type, itemName: correction.itemName },
  });
  const profile = await loadProfile();
  pushToCloud(profile, next);
  return updated;
}
