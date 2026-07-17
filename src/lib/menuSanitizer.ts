import type { ParsedMenu } from '../types';

const MAX_CATEGORIES = 100;
const MAX_ITEMS_PER_CATEGORY = 500;
const MAX_MENU_ITEMS = 2000;

function asCleanString(value: unknown, maxLength = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/**
 * Rebuild untrusted menu data from well-formed fields only.
 * Returns null when the response has no usable named dishes.
 */
export function sanitizeMenu(raw: unknown): ParsedMenu | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const inputCategories = Array.isArray(source.categories) ? source.categories : [];
  const categories: ParsedMenu['categories'] = [];
  let remainingItems = MAX_MENU_ITEMS;

  for (const inputCategory of inputCategories.slice(0, MAX_CATEGORIES)) {
    if (remainingItems === 0) break;
    if (typeof inputCategory !== 'object' || inputCategory === null) continue;

    const category = inputCategory as Record<string, unknown>;
    const inputItems = Array.isArray(category.items) ? category.items : [];
    const items: ParsedMenu['categories'][number]['items'] = [];

    for (const inputItem of inputItems.slice(0, Math.min(MAX_ITEMS_PER_CATEGORY, remainingItems))) {
      if (typeof inputItem !== 'object' || inputItem === null) continue;
      const item = inputItem as Record<string, unknown>;
      const name = asCleanString(item.name, 200);
      if (!name) continue;

      const description = asCleanString(item.description);
      const price = asCleanString(item.price, 40);
      const ingredients = Array.isArray(item.ingredients)
        ? item.ingredients
            .map((ingredient) => asCleanString(ingredient, 80))
            .filter(Boolean)
            .slice(0, 40)
        : [];

      items.push({
        name,
        ...(description ? { description } : {}),
        ...(price ? { price } : {}),
        ...(ingredients.length > 0 ? { ingredients } : {}),
      });
    }

    if (items.length === 0) continue;
    remainingItems -= items.length;
    categories.push({
      name: asCleanString(category.name, 120) || 'Menu',
      items,
    });
  }

  if (categories.length === 0) return null;

  const restaurantName = asCleanString(source.restaurantName, 160);
  const notes = asCleanString(source.notes, 600);
  const incompleteReason = asCleanString(source.incompleteReason, 300);
  const pageCount =
    typeof source.pageCount === 'number' && Number.isInteger(source.pageCount) && source.pageCount > 0
      ? Math.min(source.pageCount, 1000)
      : undefined;

  return {
    categories,
    ...(restaurantName ? { restaurantName } : {}),
    ...(notes ? { notes } : {}),
    incomplete: source.incomplete === true,
    ...(incompleteReason ? { incompleteReason } : {}),
    ...(pageCount ? { pageCount } : {}),
  };
}
