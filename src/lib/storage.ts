// Local persistence with localStorage. Same API the rest of the app expects.
// SavedRestaurant carries its own id + capturedAt so a future V2 "shared menus
// across users" feature needs no migration.

import { UserProfile, EMPTY_PROFILE, SavedRestaurant, ParsedMenu } from '../types';

const PROFILE_KEY = 'menuvoice.profile.v1';
const SAVED_KEY = 'menuvoice.savedRestaurants.v1';

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
}

export async function loadSavedRestaurants(): Promise<SavedRestaurant[]> {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function trySetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: any) {
    const isQuota = e?.name === 'QuotaExceededError' || e?.code === 22 || e?.code === 1014;
    if (!isQuota) throw e;
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

export async function saveRestaurant(name: string, menu: ParsedMenu): Promise<SavedRestaurant> {
  const list = await loadSavedRestaurants();
  const entry: SavedRestaurant = {
    id: `r-${Date.now()}`,
    name: name.trim() || 'Unnamed restaurant',
    menu,
    capturedAt: new Date().toISOString(),
  };
  const filtered = list.filter((r) => r.name.toLowerCase() !== entry.name.toLowerCase());
  filtered.unshift(entry);
  trySetItem(SAVED_KEY, JSON.stringify(filtered));
  return entry;
}

export async function deleteRestaurant(id: string): Promise<void> {
  const list = await loadSavedRestaurants();
  localStorage.setItem(SAVED_KEY, JSON.stringify(list.filter((r) => r.id !== id)));
}
