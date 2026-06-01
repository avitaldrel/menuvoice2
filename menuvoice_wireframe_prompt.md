# MenuVoice — Wireframe & Visual Design Prompt

Design detailed wireframes and a visual design system for MenuVoice, a voice-first mobile accessibility app for users with visual impairments navigating restaurant menus. This output will be used to guide a developer building the React Native prototype and as a reference for design consistency across all screens.

---

## Design Philosophy

This app is used in a restaurant, often in dim lighting, by someone who may not be looking at the screen at all. Every visual choice must serve two users simultaneously: the user who relies entirely on VoiceOver or TalkBack and cannot see the screen, and the occasional sighted companion or caregiver who glances at it.

The aesthetic should feel calm, trustworthy, and unhurried — not clinical, not flashy. Think high-contrast dark mode with warm, generous typography and breathing room. The screen should look like a quiet, well-lit room: easy to read at a glance, nothing competing for attention.

---

## Design System to Define

Before wireframing, define:

- **Color palette:** Dark mode base. Propose a warm accent color (not cold blue — think amber, warm gold, or soft teal). Every text/background combination must meet WCAG AAA contrast ratios. Provide hex codes and contrast ratios for each pairing.
- **Typography:** Large and legible. Minimum 18px body text. Headings should feel like a calm voice, not a shout. Propose a type scale (heading, subheading, body, caption, button label).
- **Touch targets:** Minimum 64×64px for all interactive elements. Generous internal padding. No small tap zones anywhere.
- **Iconography:** Minimal. Large, universally recognized icons only (camera, mic, settings, back). Every icon must have a visible text label — no icon-only buttons.
- **Motion:** None or barely perceptible. Screen reader users are disrupted by animation. Transitions should be instant or under 150ms fade. No sliding panels, no bounce animations.
- **States:** Define active, inactive, disabled, and focused states for buttons and interactive elements. The focused state (for VoiceOver navigation) must be clearly visible — high-contrast border or highlight.

---

## Screens to Wireframe

Wireframe each screen in priority order. For each screen, produce:
1. A labeled ASCII wireframe showing layout, element hierarchy, and component placement
2. A 2–4 sentence annotation explaining the key accessibility and usability decisions

### Screen 1 — Home Screen
Two primary actions: "New Restaurant" and "My Saved Restaurants." User's first name shown as a greeting. A settings icon in the corner. Nothing else. This screen should feel like a breath of air — the user should be able to identify both options and act within one or two taps or VoiceOver swipes.

### Screen 2 — Menu Capture Screen
Camera viewfinder (full-width), auto-capture status indicator ("Scanning for menu... / Hold steady... / Capturing"), running photo count badge ("3 photos captured"), a large "Done — Analyze Menu" primary button, and an "Upload from Library" secondary option. There should also be an audio feedback indicator showing that the app is speaking guidance aloud. Consider how a user who cannot see the viewfinder knows the camera is aimed correctly.

### Screen 3 — Conversation Screen (core screen)
The main interaction surface. Must show:
- A speaking/listening state indicator (large, obvious — "MenuVoice is speaking" vs. "Listening for you...")
- A scrollable conversation transcript (for sighted companions to follow along)
- A large microphone button as the primary action
- Subtle access to settings and the option to start over

This screen should feel like a clean, calm chat interface adapted entirely for audio. The visual design is secondary; the state indicator is primary.

### Screen 4 — Onboarding Flow (2–3 screens)
First-use only. Each screen asks one focused question: intro and name, then allergies/restrictions, then preferences. These should feel like a gentle conversation, not a form. Use large text, one question per screen, and minimal UI chrome. The "next" action should be obvious.

### Screen 5 — Settings Screen
Toggle for "hide prices," allergy and preference management (view and edit stored profile), saved restaurants list with delete option, TTS voice selection if multiple options are available.

### Screen 6 — Saved Restaurants Screen
List of previously visited restaurants. Each item shows restaurant name, date of last visit, and a "Load Menu" button. Option to delete a saved restaurant. Clean list layout — large row height, easy to tap.

---

## Output Format

For each screen:
- Labeled ASCII or structured text wireframe (column/row layout, component names, hierarchy)
- 2–4 sentence annotation on the key decisions

After all screens:
- **Design system summary:** palette (hex + contrast ratios), type scale, spacing scale, button and list item component specs
- **Accessibility checklist:** confirm each screen passes VoiceOver navigation order, touch target minimums, and WCAG AAA contrast

Do not produce a visual image. Produce structured text wireframes and specifications that a developer can implement directly or a designer can use to build Figma components.

Flag any screen where a design decision involves a meaningful judgment call the developer or designer should confirm before building.
