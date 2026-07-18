import { ParsedMenu, MenuProvenance } from './types';

// Lightweight route model. We avoid react-navigation to keep the Expo Go
// dependency surface tiny; a prototype with six screens does not need it.

export type Route =
  | { name: 'home' }
  | { name: 'getMenu' }
  | { name: 'capture'; appendTo?: { menu: ParsedMenu; restaurantName: string } }
  | { name: 'find' }
  | { name: 'conversation'; menu: ParsedMenu; restaurantName: string; source?: 'url' | 'find' | 'photo' | 'saved'; provenance?: MenuProvenance }
  | { name: 'saved' }
  | { name: 'settings' }
  | { name: 'tutorial' };

export type Navigate = (route: Route) => void;

export interface ScreenProps {
  navigate: Navigate;
  goBack: () => void;
}
