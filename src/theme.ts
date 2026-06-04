// MenuVoice design tokens.
// Dark mode, warm amber accent, WCAG AAA contrast, large type, generous touch targets.
// Built per menuvoice_wireframe_prompt.md.

export const colors = {
  // Background ramp
  bg: '#0E0E10', // near-black base
  surface: '#1A1A1E', // raised cards
  surfaceHigh: '#26262C', // pressed / focused fill

  // Text. On #0E0E10:
  textPrimary: '#F5F3EE', // ~16.5:1  (AAA)
  textSecondary: '#C9C6BE', // ~10.5:1 (AAA)
  textMuted: '#A19D94', // ~7.2:1   (AAA)

  // Warm amber accent. amber on dark bg, gold-leaning.
  accent: '#FFB454', // ~10.8:1 on bg (AAA)
  accentText: '#0E0E10', // text ON the accent button (dark on amber ~10.8:1)

  // States
  focus: '#FFD08A', // bright focus ring
  danger: '#FF6B6B', // allergen warning
  dangerText: '#0E0E10',
  success: '#7BD88F',

  border: '#3A3A42',
};

export const type = {
  // Minimum body 18px per spec. Calm scale, not a shout.
  display: 34,
  heading: 28,
  subheading: 22,
  body: 18,
  button: 20,
  caption: 15,
};

export const space = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 28,
  xl: 40,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
};

// Minimum interactive size per spec: 64x64.
export const TOUCH_MIN = 64;
