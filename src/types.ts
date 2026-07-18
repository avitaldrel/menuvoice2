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
  appVoice?: boolean; // app TTS on/off; off lets VoiceOver speak without overlap
}

export type MenuConfidence = 'high' | 'medium' | 'low';
export type RestaurantSource = 'photo' | 'url' | 'find';
export type CorrectionType =
  | 'wrong_price'
  | 'missing_item'
  | 'not_on_menu_anymore'
  | 'allergen_unclear';

export interface MenuItem {
  name: string;
  description?: string;
  price?: string;
  ingredients?: string[];
  confidence?: MenuConfidence;
  missing_price?: boolean;
  unknown_allergens?: string[];
  source_section?: string;
  needs_user_check?: boolean;
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
  pageCount?: number; // number of menu pages/photos captured when known
}

export interface MenuCorrection {
  id: string;
  type: CorrectionType;
  createdAt: string;
  itemName?: string;
  note?: string;
}

export interface MenuFreshness {
  source: RestaurantSource;
  firstSavedAt: string;
  lastImportedAt: string;
  correctionCount: number;
  missingPriceCount: number;
  unknownAllergenItemCount: number;
  needsUserCheckCount: number;
  lastCorrectionAt?: string;
}

export interface SavedRestaurant {
  id: string;
  name: string;
  menu: ParsedMenu;
  capturedAt: string; // ISO date
  sourceUrl?: string;
  source?: RestaurantSource;
  freshness?: MenuFreshness;
  corrections?: MenuCorrection[];
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
