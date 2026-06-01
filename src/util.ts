// Small shared helpers.

/** Turn a comma/newline separated string into a clean list of trimmed items. */
export function splitList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
