import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'menu-confidence.json');

function cleanText(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function sanitizeMenu(raw) {
  const menu = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const categories = Array.isArray(menu.categories) ? menu.categories : [];
  return {
    categories: categories
      .map((category) => {
        if (!category || typeof category !== 'object' || Array.isArray(category)) return null;
        const name = cleanText(category.name);
        if (!name || !Array.isArray(category.items)) return null;
        const items = category.items
          .map((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const itemName = cleanText(item.name);
            if (!itemName) return null;
            const price = cleanText(item.price);
            const unknownAllergens = uniqueStrings(item.unknown_allergens);
            const missingPrice = item.missing_price === true || !price;
            const confidence =
              item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low'
                ? item.confidence
                : unknownAllergens.length > 0 || missingPrice
                  ? 'medium'
                  : 'high';
            return {
              name: itemName,
              price,
              confidence,
              missing_price: missingPrice,
              unknown_allergens: unknownAllergens,
              source_section: cleanText(item.source_section) ?? name,
              needs_user_check:
                item.needs_user_check === true ||
                confidence !== 'high' ||
                missingPrice ||
                unknownAllergens.length > 0,
            };
          })
          .filter(Boolean);
        if (!items.length) return null;
        return { name, items };
      })
      .filter(Boolean),
  };
}

function getStats(menu) {
  const stats = {
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
      if (item.unknown_allergens.length > 0) stats.unknownAllergenItemCount++;
      if (item.needs_user_check) stats.needsUserCheckCount++;
      if (item.confidence === 'low') stats.lowConfidenceCount++;
      assert.ok(item.source_section, `Missing source_section for ${item.name}`);
      assert.ok(['high', 'medium', 'low'].includes(item.confidence), `Invalid confidence for ${item.name}`);
      assert.equal(typeof item.missing_price, 'boolean', `missing_price must be boolean for ${item.name}`);
      assert.equal(typeof item.needs_user_check, 'boolean', `needs_user_check must be boolean for ${item.name}`);
      assert.ok(Array.isArray(item.unknown_allergens), `unknown_allergens must be an array for ${item.name}`);
    }
  }
  return stats;
}

const fixtures = JSON.parse(await readFile(fixturePath, 'utf8'));

for (const fixture of fixtures) {
  const clean = sanitizeMenu(fixture.raw);
  const stats = getStats(clean);
  for (const [key, value] of Object.entries(fixture.expect)) {
    assert.equal(stats[key], value, `${fixture.name}: expected ${key}=${value}, got ${stats[key]}`);
  }
  console.log(`PASS ${fixture.name}`);
}

console.log(`Validated ${fixtures.length} menu confidence fixtures.`);
