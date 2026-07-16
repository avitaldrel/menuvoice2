const ICLOUD_SHORTCUT_HOST = 'www.icloud.com';
const ICLOUD_SHORTCUT_PATH = /^\/shortcuts\/[a-zA-Z0-9]+\/?$/;

type AppleNavigator = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>;

export function normalizeAppleShortcutUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== ICLOUD_SHORTCUT_HOST ||
      !ICLOUD_SHORTCUT_PATH.test(url.pathname)
    ) {
      return null;
    }

    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function configuredAppleShortcutUrl(): string | null {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return normalizeAppleShortcutUrl(env?.VITE_APPLE_SHORTCUT_URL);
}

export function isAppleMobileDevice(nav?: AppleNavigator): boolean {
  const device = nav ?? (typeof navigator === 'undefined' ? undefined : navigator);
  if (!device) return false;

  const standardIOS = /iPhone|iPad|iPod/i.test(device.userAgent);
  const iPadDesktopMode = device.platform === 'MacIntel' && device.maxTouchPoints > 1;
  return standardIOS || iPadDesktopMode;
}
