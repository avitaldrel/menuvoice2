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

import type { MenuItem } from '../types';

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

// How sure we are an allergen is present:
//   explicit  - the dish text actually DECLARES allergens ("contains milk",
//               "allergens: soy, wheat", "made with peanuts"). The restaurant
//               (or the menu) said so.
//   inferred  - we recognised an ingredient from the dish name/description, but
//               nobody confirmed it. Most matches are this. NEVER present as fact.
export type AllergenConfidence = 'explicit' | 'inferred';

export interface AllergenFinding {
  label: string;
  confidence: AllergenConfidence;
}

// Cues that a piece of dish text is an explicit allergen/ingredient declaration
// rather than just a dish name. Conservative on purpose: if these are absent we
// fall back to "inferred", because over-claiming "confirmed" is the unsafe error.
const DECLARATION_CUES = /\b(contains?|allergens?|made with|prepared with|may contain|ingredients?)\b/i;

// Is allergen group `g` an EXPLICIT declaration in this dish text? We require a
// declaration cue AND the keyword to appear, so a plain "Shrimp scampi" stays
// inferred while "Contains shellfish" is explicit.
function isExplicit(text: string, g: AllergenGroup): boolean {
  if (!DECLARATION_CUES.test(text)) return false;
  return g.keywords.some((kw) => hasWord(text, kw));
}

// Which allergen groups are present in this dish, each with a confidence.
function detectGroups(item: MenuItem): Array<{ group: AllergenGroup; confidence: AllergenConfidence }> {
  const text = itemText(item);
  const explicitText =
    DECLARATION_CUES.test(text) ? text : ''; // only check declarations against declaring text
  return ALLERGEN_GROUPS.filter((g) => g.keywords.some((kw) => hasWord(text, kw))).map((g) => ({
    group: g,
    confidence: explicitText && isExplicit(explicitText, g) ? 'explicit' : 'inferred',
  }));
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
  // The guest's own allergens found in the dish, with confidence (for copy).
  blockedBy: AllergenFinding[];
  // OTHER allergens present (not in the guest's profile), with confidence → disclaimer.
  otherAllergens: AllergenFinding[];
}

/**
 * Analyze one dish against the guest's profile allergies.
 * - blocked dishes should be removed from the visible menu.
 * - non-blocked dishes with otherAllergens should show a disclaimer.
 * Each finding carries whether the allergen was explicitly declared by the menu
 * or merely inferred from the dish name/description, so callers never present an
 * inference as confirmed.
 */
export function analyzeItemAllergens(item: MenuItem, profileAllergies: string[]): ItemAllergenInfo {
  const present = detectGroups(item);
  const blockedBy: AllergenFinding[] = [];
  const otherAllergens: AllergenFinding[] = [];
  for (const { group, confidence } of present) {
    const finding: AllergenFinding = { label: group.label, confidence };
    if (groupInProfile(group, profileAllergies)) blockedBy.push(finding);
    else otherAllergens.push(finding);
  }
  return { blocked: blockedBy.length > 0, blockedBy, otherAllergens };
}

/** Spoken/printed allergen disclaimer honoring confidence. Empty when none. */
export function allergenDisclaimer(findings: AllergenFinding[]): string {
  if (findings.length === 0) return '';
  const explicit = findings.filter((f) => f.confidence === 'explicit').map((f) => f.label);
  const inferred = findings.filter((f) => f.confidence === 'inferred').map((f) => f.label);
  const parts: string[] = [];
  if (explicit.length) parts.push(`The restaurant lists ${explicit.join(', ')}.`);
  if (inferred.length)
    parts.push(
      `This dish may contain ${inferred.join(', ')} based on the description, but the restaurant does not confirm it.`,
    );
  parts.push('Please confirm with the restaurant.');
  return parts.join(' ');
}

/**
 * One dish's accessible spoken label. Keep the dish name first so users know
 * which item the warning belongs to, then announce the warning before price,
 * description, or ingredients.
 */
export function dishSpokenLabel(item: MenuItem, otherAllergens: AllergenFinding[] = []): string {
  let label = item.name;
  if (otherAllergens.length > 0) {
    label += `. Allergen warning. ${allergenDisclaimer(otherAllergens)}`;
  }
  if (item.price) label += `. Price ${item.price}`;
  if (item.description) label += `. ${item.description}`;
  if (item.ingredients && item.ingredients.length > 0) {
    label += `. Ingredients: ${item.ingredients.join(', ')}`;
  }
  return label;
}
