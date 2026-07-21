const DEFAULT_PROFILE = {
  email: 'audit@meetmymenu.com',
  name: 'Audit',
  allergies: [],
  dislikes: [],
  spiceTolerance: 'medium',
  cuisinesLiked: [],
  pastOrders: [],
  hidePrices: false,
  ttsVoice: 'shimmer',
  onboarded: true,
  tutorialSeen: true,
};

export function resolveA11yBaseUrl(argv = process.argv, env = process.env) {
  return argv[2] ?? env.A11Y_BASE_URL ?? 'http://localhost:4173';
}

export function testProfileJson(overrides = {}) {
  return JSON.stringify({ ...DEFAULT_PROFILE, ...overrides });
}
