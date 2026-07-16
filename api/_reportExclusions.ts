// Shared internal/test-account exclusions for analytics endpoints.
// Keep this module dependency-free so dashboard view functions can import it safely.

const DEFAULT_EXCLUDED_EMAILS =
  '2firemaster27@gmail.com,avitaldrel@gmail.com,mibrahim.dev17@gmail.com,anibabug@gmail.com,ik8072369@gmail.com';

export function excludeList(): string[] {
  const raw = process.env.REPORT_EXCLUDE_EMAILS ?? DEFAULT_EXCLUDED_EMAILS;
  return raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
}

// Prefixes catch throwaway variants without requiring a new exact-email entry for
// every account. "avi" excludes avi274 and avi1@gmail.com, but not david@gmail.com.
export function excludePrefixList(): string[] {
  const raw = process.env.REPORT_EXCLUDE_EMAIL_PREFIXES ?? 'avi';
  return raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
}

export function isExcludedIdentity(
  identity: string,
  emails = excludeList(),
  prefixes = excludePrefixList(),
): boolean {
  const normalized = identity.trim().toLowerCase();
  return emails.includes(normalized) || prefixes.some((prefix) => normalized.startsWith(prefix));
}
