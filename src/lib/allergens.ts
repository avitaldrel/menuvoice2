// Allergen detection for menu items.
//
// Each dish carries ingredients (and a name/description). We map that text onto
// a small set of common allergen groups, then compare against the guest's
// profile allergies (already canonicalized by normalizeAllergens in util.ts).
//
// Two outcomes drive the menu UI:
//   - blocked:   the dish contains an allergen the guest listed → hide the dish.
//   - otherwise: list any OTHER allergens present so the dish shows a disclaimer.
//
// This is a SAFETY surface, so detection errs toward flagging: keyword matches
// are word-boundary based to avoid obvious false positives, but when in doubt we
// would rather warn or hide than stay silent.

import { MenuItem } from '../types';

interface AllergenGroup {
  key: string;
  label: string; // spoken/displayed name
  // Terms a guest might have in their profile that refer to this group.
  profileTerms: string[];
  // Ingredient / dish-text keywords that indicate this allergen is present.
  keywords: string[];
}

const ALLERGEN_GROUPS: AllergenGroup[] = [
  {
    key: 'dairy',
    label: 'dairy',
    profileTerms: ['dairy', 'milk', 'lactose', 'cheese'],
    keywords: [
      'milk', 'cream', 'butter', 'buttermilk', 'cheese', 'cheddar', 'parmesan',
      'mozzarella', 'goat cheese', 'yogurt', 'ghee', 'custard', 'gelato',
    ],
  },
  {
    key: 'egg',
    label: 'egg',
    profileTerms: ['egg', 'eggs'],
    keywords: ['egg', 'eggs', 'mayonnaise', 'mayo', 'aioli', 'meringue', 'custard'],
  },
  {
    key: 'gluten',
    label: 'gluten (wheat)',
    profileTerms: ['gluten', 'wheat', 'celiac'],
    keywords: [
      'wheat', 'flour', 'bread', 'breaded', 'bun', 'brioche', 'sourdough',
      'pasta', 'linguine', 'spaghetti', 'noodle', 'crouton', 'croutons',
      'barley', 'rye', 'farro', 'panko', 'soy sauce', 'beer',
    ],
  },
  {
    key: 'peanut',
    label: 'peanuts',
    profileTerms: ['peanut', 'peanuts', 'groundnut'],
    keywords: ['peanut', 'peanuts', 'groundnut'],
  },
  {
    key: 'treenut',
    label: 'tree nuts',
    profileTerms: [
      'tree nuts', 'tree nut', 'almond', 'almonds', 'walnut', 'walnuts',
      'cashew', 'cashews', 'pecan', 'pecans', 'pistachio', 'pistachios',
      'hazelnut', 'hazelnuts',
    ],
    keywords: [
      'almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut',
      'macadamia', 'pine nut', 'praline',
    ],
  },
  {
    key: 'soy',
    label: 'soy',
    profileTerms: ['soy', 'soya', 'soybean'],
    keywords: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh'],
  },
  {
    key: 'fish',
    label: 'fish',
    profileTerms: ['fish'],
    keywords: [
      'salmon', 'tuna', 'cod', 'anchovy', 'anchovies', 'halibut', 'trout',
      'bass', 'tilapia', 'sardine',
    ],
  },
  {
    key: 'shellfish',
    label: 'shellfish',
    profileTerms: [
      'shellfish', 'seafood', 'shrimp', 'prawn', 'crab', 'lobster', 'clam',
      'mussel', 'scallop', 'oyster', 'squid', 'calamari', 'octopus',
    ],
    keywords: [
      'shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'scallop',
      'oyster', 'squid', 'calamari', 'octopus', 'crawfish',
    ],
  },
  {
    key: 'sesame',
    label: 'sesame',
    profileTerms: ['sesame', 'tahini'],
    keywords: ['sesame', 'tahini'],
  },
];

function hasWord(haystack: string, needle: string): boolean {
  // Word-boundary match so "cream" hits "ice cream" but "egg" doesn't hit
  // "eggplant". Escape spaces/letters only — keywords are plain words.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

// Build the searchable text for a dish from its name, description, ingredients.
function itemText(item: MenuItem): string {
  return [item.name, item.description ?? '', ...(item.ingredients ?? [])]
    .join(' ')
    .toLowerCase();
}

// Which allergen groups are present in this dish.
function detectGroups(item: MenuItem): AllergenGroup[] {
  const text = itemText(item);
  return ALLERGEN_GROUPS.filter((g) => g.keywords.some((kw) => hasWord(text, kw)));
}

// Does the guest's profile list an allergy that refers to this group?
function groupInProfile(group: AllergenGroup, profileAllergies: string[]): boolean {
  const allergies = profileAllergies.map((a) => a.trim().toLowerCase()).filter(Boolean);
  return allergies.some((a) =>
    group.profileTerms.some(
      (term) => a === term || (term.length > 3 && a.includes(term)) || (a.length > 3 && term.includes(a)),
    ),
  );
}

export interface ItemAllergenInfo {
  // True when the dish contains an allergen the guest listed → it should be hidden.
  blocked: boolean;
  // Labels of the guest's own allergens found in the dish (for telemetry/copy).
  blockedBy: string[];
  // Labels of OTHER allergens present (not in the guest's profile) → disclaimer.
  otherAllergens: string[];
}

/**
 * Analyze one dish against the guest's profile allergies.
 * - blocked dishes should be removed from the visible menu.
 * - non-blocked dishes with otherAllergens should show a disclaimer.
 */
export function analyzeItemAllergens(item: MenuItem, profileAllergies: string[]): ItemAllergenInfo {
  const present = detectGroups(item);
  const blockedBy: string[] = [];
  const otherAllergens: string[] = [];
  for (const g of present) {
    if (groupInProfile(g, profileAllergies)) blockedBy.push(g.label);
    else otherAllergens.push(g.label);
  }
  return { blocked: blockedBy.length > 0, blockedBy, otherAllergens };
}
