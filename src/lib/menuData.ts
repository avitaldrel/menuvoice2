import {
  type MenuConfidence,
  type MenuCorrection,
  type MenuFreshness,
  type MenuItem,
  type ParsedMenu,
  type RestaurantSource,
  type SavedRestaurant,
  type UserProfile,
} from '../types';

export interface MenuStats {
  categoryCount: number;
  itemCount: number;
  missingPriceCount: number;
  unknownAllergenItemCount: number;
  needsUserCheckCount: number;
  lowConfidenceCount: number;
}

export interface StaffVerificationCard {
  title: string;
  intro: string;
  script: string;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const cleaned = value.trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function normalizeConfidence(raw: unknown, missingPrice: boolean, unknownAllergens: string[]): MenuConfidence {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  if (unknownAllergens.length > 0) return 'medium';
  return missingPrice ? 'medium' : 'high';
}

export function sanitizeMenuItem(raw: unknown, fallbackSection: string): MenuItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const name = cleanText(source.name);
  if (!name) return null;

  const price = cleanText(source.price);
  const missingPrice = source.missing_price === true || !price;
  const unknownAllergens = uniqueStrings(source.unknown_allergens);
  const confidence = normalizeConfidence(source.confidence, missingPrice, unknownAllergens);
  const sourceSection = cleanText(source.source_section) ?? fallbackSection;
  const needsUserCheck =
    source.needs_user_check === true ||
    confidence !== 'high' ||
    missingPrice ||
    unknownAllergens.length > 0;

  const item: MenuItem = {
    name,
    description: cleanText(source.description),
    price,
    ingredients: uniqueStrings(source.ingredients),
    confidence,
    missing_price: missingPrice,
    unknown_allergens: unknownAllergens,
    source_section: sourceSection,
    needs_user_check: needsUserCheck,
  };

  if (!item.ingredients?.length) delete item.ingredients;
  return item;
}

export function sanitizeParsedMenu(raw: unknown): ParsedMenu {
  const menu = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? (raw as Record<string, unknown>)
    : {};

  const categories = Array.isArray(menu.categories) ? menu.categories : [];
  const cleanCategories = categories
    .map((cat) => {
      if (!cat || typeof cat !== 'object' || Array.isArray(cat)) return null;
      const entry = cat as Record<string, unknown>;
      const name = cleanText(entry.name);
      if (!name || !Array.isArray(entry.items)) return null;
      const items = entry.items
        .map((item) => sanitizeMenuItem(item, name))
        .filter((item): item is MenuItem => !!item);
      if (!items.length) return null;
      return { name, items };
    })
    .filter((cat): cat is NonNullable<typeof cat> => !!cat);

  return {
    categories: cleanCategories,
    notes: cleanText(menu.notes),
    restaurantName: cleanText(menu.restaurantName),
    incomplete: menu.incomplete === true,
    pageCount: Number.isFinite(menu.pageCount as number) ? Math.max(0, Math.round(menu.pageCount as number)) : undefined,
  };
}

export function getMenuStats(menu: ParsedMenu): MenuStats {
  const stats: MenuStats = {
    categoryCount: menu.categories.length,
    itemCount: 0,
    missingPriceCount: 0,
    unknownAllergenItemCount: 0,
    needsUserCheckCount: 0,
    lowConfidenceCount: 0,
  };

  for (const category of menu.categories) {
    for (const item of category.items) {
      stats.itemCount++;
      if (item.missing_price) stats.missingPriceCount++;
      if (item.unknown_allergens?.length) stats.unknownAllergenItemCount++;
      if (item.needs_user_check) stats.needsUserCheckCount++;
      if (item.confidence === 'low') stats.lowConfidenceCount++;
    }
  }

  return stats;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function pluralize(count: number, singular: string, plural = singular + 's'): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildMenuTrustSummary(menu: ParsedMenu): string {
  const stats = getMenuStats(menu);
  const parts = [
    `${pluralize(stats.categoryCount, 'section')}`,
    `${pluralize(stats.itemCount, 'item')}`,
  ];
  if (stats.missingPriceCount > 0) parts.push(`${pluralize(stats.missingPriceCount, 'price')} missing`);
  if (stats.needsUserCheckCount > 0) parts.push(`${pluralize(stats.needsUserCheckCount, 'item')} need a quick check`);
  return `Menu check: ${parts.join(', ')}.`;
}

export function buildSavedRestaurantTrustLines(restaurant: SavedRestaurant): string[] {
  const source = restaurant.source ?? restaurant.freshness?.source ?? (restaurant.sourceUrl ? 'url' : 'photo');
  const firstLine =
    source === 'photo'
      ? `Captured from a physical menu on ${formatDate(restaurant.capturedAt)}.`
      : source === 'url'
        ? `Imported from a menu link on ${formatDate(restaurant.capturedAt)}. Online details may have changed.`
        : `Imported from an online search on ${formatDate(restaurant.capturedAt)}. Online details may have changed.`;

  const lines = [firstLine];
  const freshness = restaurant.freshness;
  if (freshness?.correctionCount) {
    const tail = freshness.lastCorrectionAt
      ? ` Latest correction ${formatDate(freshness.lastCorrectionAt)}.`
      : '';
    lines.push(`${pluralize(freshness.correctionCount, 'user correction')} recorded.${tail}`.trim());
  }
  if (freshness?.needsUserCheckCount) {
    lines.push(`${pluralize(freshness.needsUserCheckCount, 'item')} still need staff or menu confirmation.`);
  }
  return lines;
}

export function buildFreshnessMeta(
  source: RestaurantSource,
  menu: ParsedMenu,
  nowIso: string,
  prior?: SavedRestaurant,
): MenuFreshness {
  const stats = getMenuStats(menu);
  return {
    source,
    firstSavedAt: prior?.freshness?.firstSavedAt ?? prior?.capturedAt ?? nowIso,
    lastImportedAt: nowIso,
    correctionCount: prior?.corrections?.length ?? 0,
    missingPriceCount: stats.missingPriceCount,
    unknownAllergenItemCount: stats.unknownAllergenItemCount,
    needsUserCheckCount: stats.needsUserCheckCount,
    lastCorrectionAt: prior?.freshness?.lastCorrectionAt,
  };
}

function joinNatural(items: string[]): string {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function isSafetyRelated(text: string): boolean {
  return /\ballerg(y|ies|en|ens)|ingredient|contains|contain|dairy|milk|egg|peanut|nut|shellfish|fish|soy|sesame|wheat|gluten|vegan|vegetarian\b/i.test(text);
}

export function buildStaffVerificationCard(
  menu: ParsedMenu,
  profile: UserProfile,
  latestUser: string,
  latestAssistant: string,
): StaffVerificationCard | null {
  const combined = `${latestUser} ${latestAssistant}`.trim();
  if (!combined || !isSafetyRelated(combined)) return null;

  const uncertainItems = menu.categories.flatMap((category) =>
    category.items.filter((item) => item.needs_user_check || (item.unknown_allergens?.length ?? 0) > 0),
  );
  if (!uncertainItems.length) return null;

  const itemNames = uncertainItems.slice(0, 2).map((item) => item.name);
  const profileAllergies = uniqueStrings(profile.allergies);
  const unknowns = uniqueStrings(uncertainItems.flatMap((item) => item.unknown_allergens ?? []));
  const concerns = uniqueStrings([...profileAllergies, ...unknowns]).slice(0, 4);

  const itemPart = itemNames.length ? `for ${joinNatural(itemNames)}` : 'for this item';
  const concernPart = concerns.length
    ? ` whether it contains ${joinNatural(concerns)}`
    : ' the ingredients and allergy details';

  return {
    title: 'Staff verification card',
    intro: 'These menu details are not confirmed. Ask staff before ordering.',
    script: `Could you please confirm ${itemPart}, including${concernPart}, and whether there could be shared prep or fryer contact? I need to verify before I order.`,
  };
}

export function describeCorrection(correction: MenuCorrection): string {
  switch (correction.type) {
    case 'wrong_price':
      return 'Wrong price';
    case 'missing_item':
      return 'Missing item';
    case 'not_on_menu_anymore':
      return 'Not on menu anymore';
    case 'allergen_unclear':
      return 'Allergen unclear';
  }
}
