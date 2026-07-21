// Turning menu provenance into honest, speakable sentences.
//
// This is the voice of the "be honest about uncertainty" product principle.
// Every function here is PURE (no DOM, no network) so it can be unit-tested and
// reused for both the spoken line and the visible source panel. Copy follows the
// project rules for speech: no emoji, no em-dashes, plain language.

import { MenuProvenance, Freshness, SavedRestaurant } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Coarse freshness bucket from an ISO timestamp, relative to `now`. */
export function freshnessOf(checkedAtIso: string | undefined, now: number = Date.now()): Freshness {
  if (!checkedAtIso) return 'unknown';
  const t = Date.parse(checkedAtIso);
  if (Number.isNaN(t)) return 'unknown';
  const ageDays = (now - t) / DAY_MS;
  if (ageDays < 0) return 'recent'; // clock skew — treat as just checked
  if (ageDays <= 7) return 'recent';
  if (ageDays <= 45) return 'aging';
  return 'outdated';
}

/** Plain-language "when checked" phrase, e.g. "checked today", "checked 3 days ago". */
export function checkedPhrase(checkedAtIso: string | undefined, now: number = Date.now()): string {
  if (!checkedAtIso) return 'I am not sure when this menu was last checked';
  const t = Date.parse(checkedAtIso);
  if (Number.isNaN(t)) return 'I am not sure when this menu was last checked';
  const ageDays = Math.floor(Math.max(0, now - t) / DAY_MS);
  if (ageDays === 0) return 'This menu was checked today';
  if (ageDays === 1) return 'This menu was checked yesterday';
  if (ageDays <= 45) return `This menu was checked ${ageDays} days ago`;
  if (ageDays <= 75) return 'This menu was checked about a month ago, so it may be out of date';
  const months = Math.round(ageDays / 30);
  return `This menu was checked about ${months} months ago, so it may be out of date`;
}

/** "official" vs "third-party" phrasing for the source. */
function sourcePhrase(p: MenuProvenance): string {
  const label = p.sourceLabel ?? 'an online source';
  switch (p.sourceType) {
    case 'official_site':
      return `I read it from ${label}`;
    case 'official_pdf':
      return `I read it from ${label}`;
    case 'official_ordering':
      return `I read it from ${label}, which is an official ordering page`;
    case 'third_party':
      return `I read it from ${label}, which is a third-party listing, not the restaurant directly`;
    case 'direct_link':
      return 'I read it from the link you shared';
    case 'photo':
      return 'I read it from the photo of the physical menu';
    default:
      return `I read it from ${label}`;
  }
}

/** "this location" phrasing reflecting scope + confirmed branch. */
function locationPhrase(p: MenuProvenance): string {
  const where = p.confirmedLocation?.trim();
  switch (p.locationScope) {
    case 'location_specific':
      return where
        ? `This menu appears to be specific to the ${where} location`
        : 'This menu appears to be specific to that location';
    case 'generic':
      return where
        ? `I could not confirm a menu just for ${where}, so this looks like the general chain menu, which may differ from that branch`
        : 'This looks like the general chain menu, which may differ at your branch';
    default:
      return where
        ? `I believe this is the ${where} location, but I could not fully confirm the menu is specific to that branch`
        : 'I could not confirm whether this menu is specific to your branch';
  }
}

/** "complete" / "partial" phrasing with the reason when known. */
function completenessPhrase(p: MenuProvenance): string {
  if (p.completeness === 'partial') {
    const reason = p.warnings && p.warnings.length ? p.warnings[0] : '';
    // Lead with the plain fact. A partial menu must never be left sounding like
    // the whole thing, so this states it outright before explaining why.
    return reason
      ? `I found only part of this menu, because ${reason}`
      : 'I found only part of this menu, so some dishes could be missing';
  }
  if (p.completeness === 'complete') return 'It appears to be complete';
  return 'I am not certain whether this is the whole menu';
}

/**
 * The full, honest summary spoken when a menu opens or when the user asks
 * "where did this menu come from". Reads source, location, freshness, and
 * completeness in one calm paragraph.
 */
export function provenanceSummary(
  p: MenuProvenance | undefined,
  restaurantName: string,
  now: number = Date.now(),
): string {
  const name = restaurantName?.trim() || 'this restaurant';
  if (!p) {
    return `I have a menu for ${name}, but I do not have details on where it came from or how current it is. Please confirm anything important with the restaurant.`;
  }
  const officialWord = p.official ? 'an official menu' : 'a menu';
  const parts = [
    `Here is what I can tell you about this menu for ${name}.`,
    `I found ${officialWord}. ${sourcePhrase(p)}.`,
    `${locationPhrase(p)}.`,
    `${checkedPhrase(p.checkedAt, now)}.`,
    `${completenessPhrase(p)}.`,
  ];
  return parts.join(' ');
}

/** Short one-line note appended to the opening greeting (less detail than the full summary). */
export function provenanceOpeningNote(p: MenuProvenance | undefined, now: number = Date.now()): string {
  if (!p) return '';
  const officiality = p.official
    ? p.sourceType === 'third_party'
      ? 'from a third-party listing'
      : 'from an official source'
    : 'from a third-party listing';
  const scope =
    p.locationScope === 'location_specific'
      ? 'and looks specific to this location'
      : p.locationScope === 'generic'
        ? 'though it looks like the general chain menu'
        : 'though I could not confirm it is specific to your branch';
  const fresh = freshnessOf(p.checkedAt, now);
  const freshNote = fresh === 'recent' ? 'checked recently' : fresh === 'aging' ? 'checked a while ago' : fresh === 'outdated' ? 'and may be out of date' : '';
  const completeNote = p.completeness === 'partial' ? 'I found only part of it.' : '';
  const sentence = `Just so you know, this menu is ${officiality} ${scope}${freshNote ? `, ${freshNote}` : ''}.`;
  return ` ${sentence}${completeNote ? ` ${completeNote}` : ''}`;
}

/** Answer for "is this the correct location?" */
export function locationAnswer(p: MenuProvenance | undefined): string {
  if (!p) return 'I do not have location details for this menu. Please confirm with the restaurant.';
  return `${locationPhrase(p)}.`;
}

/** Answer for "is this menu complete?" */
export function completenessAnswer(p: MenuProvenance | undefined): string {
  if (!p) return 'I am not certain whether this is the whole menu. Please confirm with the restaurant.';
  return `${completenessPhrase(p)}.`;
}

/** Build a provenance object for a saved restaurant when one was not stored
 * (older saves), so the voice controls still have something to say. */
export function provenanceForSaved(r: SavedRestaurant): MenuProvenance | undefined {
  if (r.provenance) return r.provenance;
  if (!r.sourceUrl && !r.capturedAt) return undefined;
  return {
    sourceType: r.sourceUrl ? 'unknown' : 'photo',
    official: !r.sourceUrl,
    locationScope: 'unknown',
    confirmedLocation: r.location,
    sourceUrl: r.sourceUrl,
    checkedAt: r.capturedAt,
    completeness: r.menu.incomplete ? 'partial' : 'unknown',
    warnings: r.menu.incompleteReason ? [r.menu.incompleteReason] : undefined,
  };
}
