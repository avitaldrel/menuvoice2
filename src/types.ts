export interface UserProfile {
  email: string;
  name: string;
  allergies: string[];
  dislikes: string[];
  spiceTolerance: 'none' | 'mild' | 'medium' | 'hot';
  cuisinesLiked: string[];
  pastOrders: string[]; // dishes the guest decided on before — feeds recommendations
  diningHistory: DiningHistoryEntry[];
  hidePrices: boolean;
  ttsVoice: string;
  onboarded: boolean;
  imageLogging: boolean;
  appVoice?: boolean; // app TTS on/off; off lets VoiceOver speak without overlap
  // ── Accessibility preferences ──
  theme?: AppTheme; // color scheme (default 'dark')
  textScale?: TextScale; // global text size (default 'normal')
  speechRate?: number; // TTS speaking speed multiplier, 0.7–1.4 (default 1)
}

export interface DiningHistoryEntry {
  id: string;
  learnedAt: string;
  restaurantName?: string;
  location?: string;
  sourceType?: MenuSourceType;
  orders: string[];
  likes: string[];
  dislikes: string[];
  turnCount: number;
  menuItemCount?: number;
}
// Color schemes tuned for different low-vision needs:
//   dark          – light text on near-black (glare/photophobia friendly)
//   light         – near-black text on white (maximum edge contrast)
//   high-contrast – bright yellow on pure black (classic low-vision high contrast)
export type AppTheme = 'dark' | 'light' | 'high-contrast';
export type TextScale = 'normal' | 'large' | 'xlarge';

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
  createdAt?: string; // first time this restaurant/location was saved
  updatedAt?: string; // last time the saved menu data changed
  lastOpenedAt?: string;
  openCount?: number;
  saveCount?: number;
  categoryCount?: number;
  itemCount?: number;
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
  diningHistory: [],
  hidePrices: false,
  ttsVoice: 'shimmer',
  onboarded: false,
  imageLogging: false,
  theme: 'dark',
  textScale: 'normal',
  speechRate: 1,
};
