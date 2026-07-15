export interface UserProfile {
  email: string;
  name: string;
  allergies: string[];
  dislikes: string[];
  spiceTolerance: 'none' | 'mild' | 'medium' | 'hot';
  cuisinesLiked: string[];
  pastOrders: string[]; // dishes the guest decided on before — feeds recommendations
  hidePrices: boolean;
  ttsVoice: string;
  onboarded: boolean;
  imageLogging: boolean;
}

export interface MenuItem {
  name: string;
  description?: string;
  price?: string;
  ingredients?: string[];
}

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface ParsedMenu {
  categories: MenuCategory[];
  notes?: string;
  restaurantName?: string; // extracted from the menu photos if visible
  incomplete?: boolean; // model judged the menu partial (cut off, missing sections)
  incompleteReason?: string; // plain-language why it looks partial (e.g. "no drinks section")
  pageCount?: number; // number of menu pages/photos captured when known
}

// Where a menu came from and how much we can vouch for it. This is the backbone
// of the "be honest about uncertainty" product principle: every retrieved menu
// carries one of these so the UI and voice can explain source, location scope,
// freshness, and completeness instead of presenting everything as confirmed.
export type MenuSourceType =
  | 'official_site' // the restaurant's own website menu page
  | 'official_pdf' // a PDF hosted on the restaurant's own domain
  | 'official_ordering' // the restaurant's own ordering page (Toast/Square/etc.)
  | 'third_party' // a listing/aggregator (Yelp, DoorDash, Grubhub, ...)
  | 'direct_link' // a link the user pasted; officiality unknown
  | 'photo' // scanned from the physical menu by camera
  | 'unknown';

export type LocationScope =
  | 'location_specific' // evidence this menu belongs to the requested branch
  | 'generic' // a brand/chain menu not tied to one branch
  | 'unknown';

export type Completeness = 'complete' | 'partial' | 'unknown';

// Coarse freshness buckets derived from checkedAt. Not stored; computed on read.
export type Freshness = 'recent' | 'aging' | 'outdated' | 'unknown';

export interface MenuProvenance {
  sourceType: MenuSourceType;
  official: boolean; // true for official_* and (trusted) photo; false for third_party
  locationScope: LocationScope;
  confirmedLocation?: string; // human address/branch we believe this menu is for
  sourceUrl?: string;
  sourceLabel?: string; // friendly source name, e.g. "their website", "DoorDash"
  checkedAt: string; // ISO date this menu was retrieved/verified
  completeness: Completeness;
  warnings?: string[]; // anything the user should know (e.g. "drinks section missing")
}

export interface SavedRestaurant {
  id: string;
  name: string;
  menu: ParsedMenu;
  capturedAt: string; // ISO date
  sourceUrl?: string;
  location?: string; // confirmed branch address; keeps chain branches separate
  provenance?: MenuProvenance;
}

export interface ChatTurn {
  role: 'assistant' | 'user';
  text: string;
}

export const EMPTY_PROFILE: UserProfile = {
  email: '',
  name: '',
  allergies: [],
  dislikes: [],
  spiceTolerance: 'medium',
  cuisinesLiked: [],
  pastOrders: [],
  hidePrices: false,
  ttsVoice: 'shimmer',
  onboarded: false,
  imageLogging: false,
};
