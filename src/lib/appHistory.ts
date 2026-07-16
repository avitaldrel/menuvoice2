import type { Route } from '../nav';

const APP_HISTORY_KEY = 'menuvoice-navigation';
const APP_HISTORY_VERSION = 1;

export interface AppHistoryEntry {
  key: typeof APP_HISTORY_KEY;
  version: typeof APP_HISTORY_VERSION;
  position: number;
  route: Route;
}

export interface StoredAppHistoryEntry {
  key: typeof APP_HISTORY_KEY;
  version: typeof APP_HISTORY_VERSION;
  position: number;
  route?: Route;
}

export function createAppHistoryEntry(route: Route, position: number): AppHistoryEntry {
  return {
    key: APP_HISTORY_KEY,
    version: APP_HISTORY_VERSION,
    position,
    route,
  };
}

export function readAppHistoryEntry(value: unknown): StoredAppHistoryEntry | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<StoredAppHistoryEntry>;
  if (
    candidate.key !== APP_HISTORY_KEY ||
    candidate.version !== APP_HISTORY_VERSION ||
    !Number.isInteger(candidate.position) ||
    (candidate.position ?? -1) < 0
  ) {
    return null;
  }

  if (candidate.route !== undefined && !isRoute(candidate.route)) return null;

  return candidate as StoredAppHistoryEntry;
}

export function isBackNavigationKey(event: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'repeat' | 'isComposing'>): boolean {
  return event.key === 'Escape' && !event.defaultPrevented && !event.repeat && !event.isComposing;
}

function isRoute(value: unknown): value is Route {
  if (!value || typeof value !== 'object') return false;
  const name = (value as { name?: unknown }).name;
  return name === 'home' || name === 'capture' || name === 'find' || name === 'conversation' || name === 'saved' || name === 'settings' || name === 'tutorial';
}
