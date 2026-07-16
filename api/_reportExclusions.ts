// Shared internal/test-account exclusions for analytics endpoints.
// Keep this module dependency-free so dashboard view functions can import it safely.

const DEFAULT_EXCLUDED_EMAILS =
  '2firemaster27@gmail.com,avitaldrel@gmail.com,mibrahim.dev17@gmail.com,anibabug@gmail.com,ik8072369@gmail.com';

export function excludeList(): string[] {
  const raw = process.env.REPORT_EXCLUDE_EMAILS ?? DEFAULT_EXCLUDED_EMAILS;
  return raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
}

// Match only the throwaway shape "avi" plus optional digits, ending there or at
// the email separator. This excludes avi274 and avi1@gmail.com while preserving
// Avital..., Ravital..., and labels such as "Avi Trail Personal".
export function excludePatternList(): string[] {
  return ['^avi[0-9]*(@|$)'];
}

export function isExcludedIdentity(
  identity: string,
  emails = excludeList(),
  patterns = excludePatternList(),
): boolean {
  const normalized = identity.trim().toLowerCase();
  return emails.includes(normalized) || patterns.some((pattern) => new RegExp(pattern, 'i').test(normalized));
}
