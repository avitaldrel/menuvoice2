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
      'milk', 'cream', 'creamy', 'creme', 'crème', 'buttermilk', 'butter',
      'cheese', 'cheddar', 'parmesan', 'parmigiano', 'mozzarella', 'feta',
      'ricotta', 'provolone', 'gouda', 'brie', 'blue cheese', 'goat cheese',
      'gruyere', 'gruyère', 'mascarpone', 'burrata', 'queso', 'paneer',
      'yogurt', 'yoghurt', 'ghee', 'custard', 'gelato', 'ice cream', 'whey',
      'casein', 'curd', 'bechamel', 'béchamel', 'alfredo', 'sour cream',
      'half and half', 'condensed milk', 'clotted cream', 'panna',
    ],
  },
  {
    key: 'egg',
    label: 'egg',
    profileTerms: ['egg', 'eggs'],
    keywords: [
      'egg', 'eggs', 'mayonnaise', 'mayo', 'aioli', 'aïoli', 'meringue',
      'custard', 'hollandaise', 'frittata', 'omelet', 'omelette', 'quiche',
      'carbonara', 'egg wash', 'albumen', 'caesar dressing', 'tempura',
      'brioche',
    ],
  },
  {
    key: 'gluten',
    label: 'gluten (wheat)',
    profileTerms: ['gluten', 'wheat', 'celiac'],
    keywords: [
      'wheat', 'flour', 'bread', 'breaded', 'breadcrumb', 'breadcrumbs',
      'panko', 'bun', 'brioche', 'sourdough', 'baguette', 'ciabatta',
      'focaccia', 'pita', 'naan', 'tortilla', 'pasta', 'linguine',
      'spaghetti', 'penne', 'fettuccine', 'macaroni', 'rigatoni', 'orzo',
      'gnocchi', 'noodle', 'noodles', 'ramen', 'udon', 'dumpling', 'wonton',
      'ravioli', 'lasagna', 'crouton', 'croutons', 'barley', 'rye', 'farro',
      'bulgur', 'couscous', 'semolina', 'seitan', 'malt', 'beer', 'soy sauce',
      'teriyaki', 'pancake', 'waffle', 'batter', 'tempura', 'roux', 'cracker',
      'crackers', 'pretzel', 'biscuit', 'pastry', 'pie crust', 'phyllo',
      'puff pastry', 'toast', 'crostini', 'bruschetta',
    ],
  },
  {
    key: 'peanut',
    label: 'peanuts',
    profileTerms: ['peanut', 'peanuts', 'groundnut'],
    keywords: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'satay', 'peanut butter'],
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
      'almond', 'almonds', 'walnut', 'walnuts', 'cashew', 'cashews', 'pecan',
      'pecans', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts',
      'macadamia', 'pine nut', 'pine nuts', 'praline', 'brazil nut',
      'chestnut', 'marzipan', 'nutella', 'pesto', 'frangipane', 'amaretto',
      'nougat',
    ],
  },
  {
    key: 'soy',
    label: 'soy',
    profileTerms: ['soy', 'soya', 'soybean'],
    keywords: [
      'soy', 'soya', 'soybean', 'soybeans', 'tofu', 'edamame', 'miso',
      'tempeh', 'tamari', 'soy sauce', 'teriyaki', 'hoisin',
    ],
  },
  {
    key: 'fish',
    label: 'fish',
    profileTerms: ['fish'],
    keywords: [
      'salmon', 'tuna', 'cod', 'anchovy', 'anchovies', 'halibut', 'trout',
      'sea bass', 'tilapia', 'sardine', 'sardines', 'mackerel', 'herring',
      'snapper', 'haddock', 'catfish', 'swordfish', 'mahi', 'branzino',
      'fish sauce', 'worcestershire', 'nam pla', 'caesar dressing',
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
      'shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'clam', 'clams',
      'mussel', 'mussels', 'scallop', 'scallops', 'oyster', 'oysters',
      'squid', 'calamari', 'octopus', 'crawfish', 'crayfish', 'langoustine',
      'shellfish',
    ],
  },
  {
    key: 'sesame',
    label: 'sesame',
    profileTerms: ['sesame', 'tahini'],
    keywords: ['sesame', 'tahini', 'hummus', 'halva', "za'atar", 'benne'],
  },
  {
    key: 'mustard',
    label: 'mustard',
    profileTerms: ['mustard'],
    keywords: ['mustard', 'dijon'],
  },
  {
    key: 'celery',
    label: 'celery',
    profileTerms: ['celery', 'celeriac'],
    keywords: ['celery', 'celeriac'],
  },
  {
    key: 'sulfites',
    label: 'sulfites',
    profileTerms: ['sulfite', 'sulfites', 'sulphite', 'sulphites'],
    keywords: ['wine', 'sulfite', 'sulfites', 'sulphite', 'balsamic'],
  },
  {
    key: 'coconut',
    label: 'coconut',
    profileTerms: ['coconut'],
    keywords: ['coconut'],
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

/**
 * A prominent ALERT for allergens the guest personally listed. Unlike the
 * general disclaimer, this always fires (even for inferred matches) because it
 * concerns the guest's own safety, but it stays honest about confidence.
 */
export function allergenAlertText(findings: AllergenFinding[]): string {
  if (findings.length === 0) return '';
  const labels = findings.map((f) => f.label);
  const list =
    labels.length === 1
      ? labels[0]
      : labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
  const verb = labels.length === 1 ? 'is one of your allergens' : 'are among your allergens';
  const allExplicit = findings.every((f) => f.confidence === 'explicit');
  const basis = allExplicit
    ? 'The restaurant lists this.'
    : 'This is based on the dish description, so please confirm with the restaurant.';
  return `Alert. This dish contains ${list}, which ${verb}. ${basis}`;
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
