// Small shared helpers.

/** Turn a comma/newline separated string into a clean list of trimmed items. */
export function splitList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse a spoken/typed list. Handles "x and y", and "none"/"no" -> []. */
export function parseList(text: string): string[] {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned || /^(no|none|nope|nothing|n\/?a|no allergies|i have none|i don'?t have any)\b/.test(cleaned)) {
    return [];
  }
  return splitList(text.replace(/\band\b/gi, ','));
}

/** Strip common lead-ins so a spoken "my name is Avital." becomes "Avital". */
export function cleanName(text: string): string {
  return text
    .trim()
    .replace(/^(my name is|i'?m|i am|it'?s|call me|this is)\s+/i, '')
    .replace(/[.!,]+$/, '')
    .trim();
}

/** Merge two string lists, case-insensitive de-dupe, keep most recent `cap`. */
export function mergeUnique(existing: string[], add: string[], cap = 30): string[] {
  const seen = new Set(existing.map((s) => s.toLowerCase()));
  const out = [...existing];
  for (const item of add) {
    const t = item.trim();
    if (!t) continue;
    if (!seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(-cap);
}
