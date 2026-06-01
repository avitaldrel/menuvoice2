# MenuVoice — Build Prompt

Build a working prototype of a voice-first mobile accessibility app that helps users with visual impairments navigate restaurant menus. Working title: MenuVoice.

**Who uses this and why it matters:** The primary user is someone with a visual impairment who may be operating their phone entirely through VoiceOver (iOS) or TalkBack (Android). They sit down at a restaurant, cannot read the physical menu, and need to understand what's available, filter for their allergies, and have a natural conversation about the food — without needing sighted assistance. Every design and implementation decision should be made through this lens.

---

## Platform

Build as a React Native app targeting iOS first, with TestFlight distribution for prototype testing. If a mobile-optimized web app would give meaningfully better VoiceOver compatibility for a prototype, make that case and build that instead — the goal is a working, testable prototype, not a specific tech choice. Prioritize VoiceOver (iOS) as the gold standard for accessibility testing throughout.

---

## Core App Flow

### 1. Login and Onboarding

Simple email/password auth (Firebase Auth or Supabase Auth). On first use only, run a short spoken onboarding conversation: the app introduces itself, then asks the user their name, any food allergies or dietary restrictions, and general preferences (spice tolerance, cuisine likes and dislikes). Store this profile persistently.

### 2. Home Screen

Two large buttons: "New Restaurant" and "My Saved Restaurants." Nothing else.

### 3. Menu Capture — a key differentiator, build this well

- **Multi-photo capture:** The user can take one or multiple photos of a menu (multi-page menus, menu boards, specials boards). After each capture, the app confirms with audio feedback: "Got it. Photo 1 captured. Take another or say you're done." The app tells the user the running photo count at all times.
- **Camera roll upload:** User can upload photos from their device.
- **URL or name lookup:** User can enter or paste a restaurant URL or name; the app attempts to find and parse the online menu where available.
- **Auto-capture assist:** Implement and test two behaviors — (a) automatic shutter trigger when a flat menu page is detected and held steady in frame, similar to a document scanner, and (b) real-time audio coaching that guides positioning ("move right slightly, hold still, good — capturing now"). Ship whichever proves more reliable in prototype testing. If both work well, include them as a user-selectable setting.
- **Readability check:** If a photo is unreadable or too blurry, the app says so immediately and prompts a retake before proceeding. Do not silently fail.

### 4. AI Menu Analysis

Send captured images to GPT-4o mini (vision). The AI organizes the menu into major categories (appetizers, mains, desserts, drinks, specials, etc.) and builds an internal structured representation of every item: name, description, price, and ingredients where visible.

### 5. Conversational Navigation — the core experience

- **App speaks first, every time.** Opening line announces the categories found: "I found four sections on this menu: appetizers, mains, desserts, and drinks. Where would you like to start?"
- **Strict turn-taking:** The app listens only after it finishes speaking. It waits for the user to finish their full sentence before processing. No interruption. No premature cutoff. This is a hard requirement — earlier voice AI apps cutting the user off mid-sentence is specifically what this app must not do.
- **Conversation depth:** The user can ask about any item, request full descriptions, ask about ingredients, ask "what do you recommend," ask for the cheapest option in a category, ask what fits their diet, and drill into any detail at any point.
- **Proactive allergen flagging:** If the user asks about or is considering an item containing one of their stored allergens, the app flags it before describing the item. Example: "Heads up — this contains shellfish, which is one of your allergies. Want me to continue?"
- **Prices:** Spoken and shown by default. User can toggle "hide prices" in settings for sessions where they prefer not to have cost influence their choices.

### 6. Voice and TTS

- **Speech output:** OpenAI TTS. Use `tts-1-hd` or `gpt-4o-audio-preview` — whichever produces the most natural, emotionally warm voice at reasonable API cost for a prototype. Test both and choose.
- **Speech input:** OpenAI Whisper API for STT. If the device's native STT produces meaningfully better results when VoiceOver is active, note this and use it instead.
- **Accessibility:** The app must be fully compatible with VoiceOver (iOS) and TalkBack (Android). All interactive elements must have accessible labels. Audio output must not conflict with screen reader speech.

---

## Personalization — a key differentiator, build this well

- After each session, update the user's preference profile based on what they showed interest in or ordered.
- Allergies and restrictions are surfaced proactively in every conversation (see allergen flagging above) — the user should never have to re-state their allergies.
- **Saved restaurants:** After using a menu, the restaurant name and its parsed menu are saved to the user's profile. On a return visit, the user can load the saved menu without re-capturing. The app should prompt: "I have a saved menu for this restaurant from your last visit. Would you like to use it or capture a new one?"
- **Cross-user menus (V2 only):** Design the data model to allow multiple users to access a shared restaurant's menu once one person has captured it. Do not build this feature in the prototype, but the schema should accommodate it without a migration.

---

## UI Requirements

- Extremely simple. Large touch targets (minimum 64px). High contrast (WCAG AAA). No decorative elements that add noise for screen readers.
- All interactive elements have descriptive accessible labels. All audio output is non-conflicting when VoiceOver is active.
- Every screen must be fully operable without looking at it.
- The onboarding introduction should explain the app concisely — one short spoken paragraph, not a wall of text.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React Native (iOS-first, TestFlight) or mobile web — see platform note |
| Vision + Chat | OpenAI GPT-4o mini |
| Speech output | OpenAI TTS (tts-1-hd or gpt-4o-audio-preview) |
| Speech input | OpenAI Whisper API |
| Auth | Firebase Auth or Supabase Auth |
| Database | Firebase Firestore or Supabase — choose based on frontend pairing. Must store: user profiles, allergens, preferences, conversation history, restaurant menus, and saved restaurant records. |

---

## Deliverable

A working prototype that actually runs. Must include:
- Login and first-use onboarding
- Menu capture (photo, multi-photo, camera roll, URL lookup)
- Auto-capture assist (at least one of the two behaviors)
- AI-powered conversational menu navigation with strict turn-taking
- Full TTS/STT loop — app speaks, waits, listens, responds
- Proactive allergen flagging using stored user profile
- Preference memory that updates each session
- Saved restaurant history with reload option
- Price toggle setting

Include a README with setup instructions: which API keys are needed, how to run locally, and how to build for TestFlight if applicable.

Production-hardened is not the goal. Working, testable, and demonstrating the full loop — that is the goal. If a feature is partially built or stubbed, say so explicitly in the README rather than leaving silent gaps.

If anything is technically unclear or there is a meaningfully better approach to any feature described here, flag it before building rather than silently substituting.
