# Top 3 Improvements Integration Plan

Date: 2026-06-18

## Goal

Integrate three selected backlog ideas into the current MenuVoice app without disrupting the active accessibility and fix-plan work already tracked in `FIXES-NEEDED.md`:

1. Menu confidence layer plus extraction eval harness
2. Correction loop tied to menu freshness
3. Staff verification card for uncertain allergy or ingredient answers

This pass stays conservative. It adds metadata, storage hooks, and accessible UI paths inside the existing capture, find, saved-menu, and conversation flows. It does not try to redesign the full menu pipeline, build an admin review tool, or claim verified food safety from unverified menu text.

## Backlog Cross-Check

- `FIXES-EXECUTION-PLAN.md` was requested but is not present in this worktree.
- `FIXES-NEEDED.md` remains the active repo backlog source and already covers adjacent accessibility work such as first-use guidance, pause controls, allergy normalization, and restaurant confirmation.
- The three selected ideas do not duplicate a completed item in the current repo. They add menu-data trust, correction capture, and staff-confirm safety behavior on top of the existing flow.

## Planned Files

Likely touched repo files:

- `TOP-3-IMPROVEMENTS-INTEGRATION-PLAN.md`
- `src/types.ts`
- `src/nav.ts`
- `src/lib/openai.ts`
- `src/lib/storage.ts`
- `src/screens/CaptureScreen.tsx`
- `src/screens/FindScreen.tsx`
- `src/screens/ConversationScreen.tsx`
- `src/screens/SavedScreen.tsx`
- `src/index.css`
- `api/_menuCore.ts`
- `api/find-menu.ts`

Likely new repo files:

- `src/lib/menuData.ts` or equivalent shared menu-metadata helpers
- `scripts/eval-menu-confidence.mjs`
- `scripts/fixtures/menu-confidence.json` or equivalent fixture data

Durable non-repo docs that may be updated only after implementation lands:

- `C:\Users\2fire\OneDrive\Documents\nightime acutomations\IDEAS.md`
- `C:\Users\2fire\OneDrive\Documents\nightime acutomations\LEARNINGS.md` only if a durable lesson appears
- `C:\Users\2fire\OneDrive\Documents\nightime acutomations\RUN_LOG.md` only if the run outcome is worth recording
- `C:\Users\2fire\OneDrive\Documents\nightime acutomations\SOURCES.md` only if a genuinely new external source is used

## Data And Schema Changes

### Menu item trust fields

Extend parsed menu items with conservative uncertainty fields:

- `confidence`: `high | medium | low`
- `missing_price`: boolean
- `unknown_allergens`: string[]
- `source_section`: string
- `needs_user_check`: boolean

Rules:

- `source_section` should default to the enclosing section name when the model omits it.
- `missing_price` should be true when the item has no readable price.
- `needs_user_check` should become true when confidence is not high, when price is missing, or when allergen details are unclear.
- `unknown_allergens` is for unclear or unverified allergen-relevant details, not for guaranteed claims.

### Saved menu freshness and correction metadata

Extend saved restaurants with:

- `source`: `photo | url | find`
- `freshness` object with imported-at and correction summary fields
- `corrections` array with correction type, timestamp, and optional item/note

Target correction types:

- `wrong_price`
- `missing_item`
- `not_on_menu_anymore`
- `allergen_unclear`

The storage shape should preserve existing saved menus and treat missing new fields as legacy data rather than a migration failure.

## UI And Voice Behavior

### Conversation screen

- Show trust or freshness summary near the top using plain language.
- Surface menu-item uncertainty in the browseable menu text so screen-reader users can hear when a dish needs verification.
- Add four accessible correction actions that save locally and emit telemetry.
- Add a staff verification card when allergy or ingredient uncertainty matters. The card must include:
  - large visible text
  - a DOM path readable by screen readers
  - a play-aloud action using existing speech
  - conservative wording that asks staff to confirm ingredients or cross-contact

### Saved screen

- Show lightweight freshness or trust details for each saved restaurant, such as imported source, correction count, or “details may have changed.”
- Never imply live verification. Online menus should be described as imported, not guaranteed current.

### Capture and find flows

- Save source metadata when creating or replacing a saved restaurant.
- Preserve correction history if the same restaurant is re-saved.

## Accessibility Requirements

- Every spoken instruction must also exist in visible DOM or a live region.
- No emojis in speech or safety copy.
- No visual-only status cues for uncertainty, freshness, or correction actions.
- Allergy copy must stay conservative:
  - never say an item is safe unless the data is actually verified
  - prefer wording like “details are unclear” or “ask staff to confirm”
- Buttons and trust cards must stay reachable by VoiceOver and keyboard users.

## Eval Harness

Add a small fixture-based script that validates messy menu payloads before or after sanitization. The harness should check:

- invalid category or item shapes are dropped safely
- every surviving item has the new trust fields
- `missing_price`, `unknown_allergens`, and `needs_user_check` behave consistently
- section fallback and uncertainty counts are stable for regression use

This harness is intentionally small. It is a guardrail, not a full test suite.

## Verification Plan

Code-level verification:

- `npm run build`
- `npm run a11y:audit` if the local preview flow is still workable in this environment
- run the new menu eval harness script directly if added as a standalone script

Behavior checks to perform in code or through the audit path:

- parsed menus keep the new trust fields from both image parsing and URL or search parsing
- saved menus retain freshness and correction metadata
- correction actions record telemetry and persist locally
- staff verification card appears only for uncertain allergy or ingredient cases and uses conservative text
- menu browsing still exposes all information through DOM text and screen-reader-friendly structure

## Risks

- The same menu types exist in both client and server code paths today, so the new metadata must stay consistent across both.
- Re-saving a restaurant currently replaces the old entry by name; that behavior must be updated carefully so correction history is not lost.
- Extra uncertainty text could make browse mode noisy if it is repeated too aggressively.
- `npm run a11y:audit` may depend on local preview/browser state and could fail for environment reasons unrelated to the feature.

## Explicit Non-Goals

This pass will not:

- build a restaurant-owner dashboard or review queue UI
- add a real backend freshness scoring service
- claim verified allergen safety from OCR or LLM output
- redesign the whole conversation model
- replace the existing capture guidance or broader accessibility backlog items already tracked elsewhere

## Success Criteria

The implementation is successful if:

- parsed menu items now carry usable uncertainty metadata
- saved menus preserve source and correction-based freshness context
- users can record the four correction types in-app
- uncertain allergy or ingredient flows expose a staff verification card with spoken and screen-readable wording
- the plan file exists at the repo root
- durable automation docs are updated only to reflect what actually landed
