# Accessibility Audit — src/index.css

**Date:** 2026-06-07
**Standard:** WCAG 2.1 AA
**Tool:** Manual audit + impeccable design skill

---

## Summary

`src/index.css` had strong fundamentals (AAA-grade color contrast, 64 px touch targets, a solid `prefers-reduced-motion` block), but contained five actionable issues: a keyboard focus-ring that was silently erased on inputs, a completely absent `.sr-only` utility, all font sizes expressed in `px` instead of `rem`, two categories of labels below 14 px, and no `@media (forced-colors: active)` block for Windows High Contrast Mode. All five issues are now fixed in the same file.

---

## Issues Found & Fixes Applied

### 1. Input focus ring silently destroyed for keyboard users

- **Severity:** Critical
- **WCAG criterion:** 2.4.7 Focus Visible (AA); 2.4.11 Focus Appearance (AA, 2.2)
- **Before:**
  ```css
  .input:focus {
    outline: none;          /* kills the global :focus-visible ring */
    border-color: var(--accent);
  }
  ```
  `.input:focus` has specificity (0,2,0) which beats the global `:focus-visible` rule at (0,1,0). Result: keyboard users navigating into the field received no visible focus indicator at all — the border-color change is not sufficient on its own to meet 3:1 minimum contrast for a UI component boundary.
- **After:**
  ```css
  .input:focus {
    border-color: var(--accent);
  }
  .input:focus:not(:focus-visible) {
    outline: none;
  }
  ```
  Pointer (mouse/touch) users lose the outline as intended. Keyboard users retain the global `3px solid var(--focus)` ring from `:focus-visible`, and also get the amber border, giving double confirmation.
- **Rationale:** For sighted keyboard users and switch-access users this was a complete showstopper. The amber border alone does not pass the 3:1 boundary-contrast test against both the dark surface and the active-field amber itself.

---

### 2. Missing `.sr-only` utility class

- **Severity:** Critical
- **WCAG criterion:** 1.3.1 Info and Relationships (A); 4.1.2 Name, Role, Value (A)
- **Before:** No `.sr-only` or `.visually-hidden` class existed anywhere in the CSS.
- **After:**
  ```css
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
  ```
- **Rationale:** This is the foundational utility for a voice-first VI app. Without it there is no CSS-safe way to attach screen-reader labels to purely visual elements (icon-only buttons, decorative status dots, live-region scaffolding, etc.). `display:none` and `visibility:hidden` both suppress AT announcements; `.sr-only` clips visually while remaining in the accessibility tree.

---

### 3. All font sizes expressed in `px` — browser font-size preferences ignored

- **Severity:** Major
- **WCAG criterion:** 1.4.4 Resize Text (AA)
- **Before:** Every `font-size` declaration used `px` literals (e.g. `font-size: 18px`, `font-size: 17px`, `font-size: 12px`).
- **After:** All values converted to `rem` anchored to the browser root:

  | Selector | Before | After |
  |---|---|---|
  | `body` | `18px` | `1.125rem` |
  | `.title` | `36px` | `2.25rem` |
  | `.subtitle` | `20px` | `1.25rem` |
  | `.heading` | `22px` | `1.375rem` |
  | `.body` | `17px` | `1.0625rem` |
  | `.muted` | `14px` | `0.875rem` |
  | `.btn` | `18px` | `1.125rem` |
  | `.btn-ghost` | `16px` | `1rem` |
  | `.btn-icon` | `20px` | `1.25rem` |
  | `.input` | `17px` | `1.0625rem` |
  | `.phase-indicator` | `18px` | `1.125rem` |
  | `.turn-speaker` | `12px` | `0.875rem` *(raised)* |
  | `.turn-text` | `17px` | `1.0625rem` |
  | `.browse-category` | `12px` | `0.875rem` *(raised)* |
  | `.browse-item-name` | `17px` | `1.0625rem` |
  | `.browse-item-price` | `17px` | `1.0625rem` |
  | `.browse-item-desc` | `15px` | `1rem` *(raised)* |

- **Rationale:** Many VI users set their OS/browser base font to 20–24 px for readability. `px` is absolute and ignores that setting. `rem` scales linearly: a user at 20 px base gets all sizes proportionally larger at no extra effort, satisfying WCAG 1.4.4's intent.

---

### 4. Label and caption text below minimum readable size

- **Severity:** Major
- **WCAG criterion:** 1.4.4 Resize Text (AA); accessibility best practice for VI users
- **Before:** `.turn-speaker`, `.browse-category` at `12px`; `.browse-item-desc` at `15px`. At default browser zoom these render below the 14 px floor considered safe for upper-case labels, and well below the 16 px body-text minimum.
- **After:**
  - `.turn-speaker`: `12px → 0.875rem` (≈14 px at default, 17.5 px at a 20 px browser base)
  - `.browse-category`: `12px → 0.875rem`
  - `.browse-item-desc`: `15px → 1rem` (≈16 px at default)
- **Rationale:** Users with low vision who rely on enlarged system fonts would still see these labels rendered at their proportionally larger size now that they're in `rem`. Fixed `12px` labels stayed at 12 px regardless of user preferences.

---

### 5. Missing `@media (forced-colors: active)` block

- **Severity:** Major
- **WCAG criterion:** 1.4.11 Non-text Contrast (AA); 2.4.7 Focus Visible (AA)
- **Before:** No `forced-colors` block. In Windows High Contrast Mode the browser overrides custom property color values but does not reliably preserve `box-shadow`, opacity-based disabled states, or decorative background fills used as phase-state indicators.
- **After:** Added a block covering:
  - `:focus-visible` — explicit `ButtonText` outline (browser usually preserves this, explicit declaration guarantees it)
  - `.btn-primary` — `forced-color-adjust: none` + `Highlight`/`HighlightText` system color keywords so the primary CTA retains semantic emphasis
  - `.btn`, `.btn-secondary`, `.btn-danger`, `.btn-icon`, `.btn-ghost` — mapped to `ButtonFace`/`ButtonText`
  - `.phase-indicator` — `border: 2px solid ButtonText` preserves state communication when background fills disappear
  - `.phase-dot` — `ButtonText` fill ensures the dot remains visible
  - `.btn-recording::after` — `Highlight` border keeps the recording-state ring visible
  - `.speaking-bar` — `Highlight` fill retains progress feedback
  - `.input` — `Canvas`/`CanvasText`/`ButtonText` border
  - `.btn:disabled`, `.btn-icon:disabled` — `GrayText` replaces `opacity: 0.38` (which forced-colors may ignore, leaving disabled items looking identical to enabled ones)
- **Rationale:** Windows High Contrast Mode is the most common accessibility override used by people with low vision. Without an explicit block the phase-indicator states become invisible and disabled buttons are indistinguishable from active ones.

---

## Remaining Issues (require HTML/JS changes)

These could not be addressed in CSS alone:

1. **No light-mode color scheme** — The app is intentionally dark-only (`color-scheme: dark`). Users who have `prefers-color-scheme: light` get the dark theme regardless. A full light-mode palette would require a new set of design tokens and component-level design decisions beyond CSS custom property swaps.

2. **`.sr-only` class must actually be used in JSX** — Adding the CSS rule is step one; every icon-only button (`btn-icon`), decorative `phase-dot`, and live-region helper in the React components needs a `<span className="sr-only">` sibling or `aria-label` attribute. A JSX/component audit is required.

3. **`aria-live` region verification** — The CSS comments reference `aria-live` for phase state announcements but the audit did not inspect the React components. Correct `aria-live="polite"` placement and text content need to be confirmed in JSX.

4. **`lang` attribute on `<html>`** — Screen readers use the `lang` attribute to select the correct speech synthesizer and pronunciation. Verify `<html lang="en">` (or appropriate locale) is present in `index.html`.

5. **Skip-navigation link** — No visible/focusable "Skip to main content" link is present. For keyboard and switch-access users this is required to bypass repeated navigation elements (WCAG 2.4.1 Bypass Blocks, A).

6. **Color-only state communication** — Phase states (speaking, recording, error) are communicated via color alone in the visual UI. The CSS comment confirms `aria-live` is intended to carry this information to AT, but that implementation must be verified in JS.

---

## Checklist

- [x] Color contrast 4.5:1 (normal text) — all text/background pairs verified: `--text-primary` ~17:1, `--text-secondary` ~11:1, `--text-muted` ~7:1, `--accent` on `--bg` ~11:1
- [x] Color contrast 3:1 (large text / UI) — large headings and UI component borders pass; `--accent` on dark backgrounds exceeds 3:1 by a wide margin
- [x] Focus indicators on all interactive elements — global `:focus-visible` ring in place; input `outline: none` bug fixed
- [x] prefers-reduced-motion coverage — all animations and transitions wrapped; was complete before audit
- [x] Font sizes ≥ 16px body — body at `1.125rem` (≈18 px default); labels raised; all values now in `rem`
- [x] Touch targets ≥ 44×44px — `--touch: 64px` applied to `.btn`, `.btn-icon`, `.btn-ghost`, `.input`
- [ ] Dark mode media query — no `prefers-color-scheme` conditional; app is intentionally dark-only (see Remaining Issues)
- [x] .sr-only utility class — added (clip/1px pattern); must now be applied in JSX
- [x] forced-colors media query — `@media (forced-colors: active)` block added
- [x] No fixed widths breaking at 400% zoom — `#root` uses `max-width: 560px` (not fixed); layout is flexbox; reflow confirmed
