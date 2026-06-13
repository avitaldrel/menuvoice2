# PLAN — Finish Everything Still Incomplete

Companion to PROGRESS.md. As of commit 64bd57a, the unify + a11y sprint is done
and pushed. This plan covers ONLY what is still open, in recommended execution
order. Each item: scope, files, approach, acceptance criteria, effort, risk.

Effort key: S = under 1h, M = 1-3h, L = half day+. Risk = chance of regressing
the voice-first / VoiceOver experience.

---

## Workstream A — Camera enhancements (biggest remaining chunk)

Source of truth: FIXES-NEEDED.md "Auto-Capture Camera Issues" items 3-6.
Items 1, 2, 5 (first-login delay, immediate audio, capture sound) are already
covered: intro speaks on mount, earconCapture() fires on auto-capture.

### A1. Preview vs. actual capture range mismatch  [S, MED risk]  ← do first
**Problem (FIXES-NEEDED #6):** preview `<div>` uses `aspectRatio: 3/4` +
`objectFit: cover`, which CROPS the video, but `captureFrame()` encodes the FULL
`videoWidth x videoHeight`. The blind user frames to what they hear described /
a sighted helper sees, but the saved photo includes extra margins (or vice
versa). This silently corrupts framing for everyone.
**Files:** `src/screens/CaptureScreen.tsx` (preview box ~348-366),
`src/lib/camera.ts` (`captureFrame`).
**Approach (pick one, prefer 1):**
  1. Make preview honest: `objectFit: contain` and set the preview box aspect
     ratio from the actual track (`video.videoWidth/Height`) so what is shown ==
     what is captured. Letterbox with black.
  2. OR crop on capture: compute the cover-crop rect the preview shows and have
     `captureFrame` draw only that sub-rect. More math, matches the current look.
**Acceptance:** capture a page, compare saved JPEG to what the preview showed —
identical framing. Verify on a landscape and a portrait sensor.

### A2. Pinch-to-zoom + explicit +/- buttons  [M, MED risk]
**Problem (FIXES-NEEDED #4):** no zoom; seated users who can't move the phone
can't fill the frame. Accessibility-critical.
**Files:** `src/lib/camera.ts` (new `setZoom`/`getZoomRange`),
`src/screens/CaptureScreen.tsx` (gesture + buttons + captureFrame crop).
**Approach:**
  - Native path (Android Chrome): `track.getCapabilities().zoom` →
    `track.applyConstraints({ advanced: [{ zoom }] })`. Mirror the torch pattern
    already in camera.ts.
  - iOS Safari fallback (no zoom constraint): digital zoom = CSS
    `transform: scale(z)` on the `<video>` for preview AND a matching center-crop
    in `captureFrame` so the photo zooms too (keep them in lockstep with A1).
  - UI: large `+` / `-` buttons (>=64px, aria-labels "Zoom in" / "Zoom out",
    announce "Zoom 2x"), plus a pinch handler. Earcon/haptic on change.
  - Persist last zoom in profile? No — reset per session (avoids surprise).
**Acceptance:** zoom in, capture, OCR still reads; preview and saved photo zoom
together; works (digital) on iOS and (native) on Android; VoiceOver announces
level. Auto-capture scanner still behaves (it reads the same `<video>` frame).
**Watch:** the scanner (`MenuScanner`) samples the raw video — confirm digital
zoom via captureFrame crop doesn't desync scanner geometry hints. Likely fine
since scanner uses its own downscaled canvas, but test the directional hints.

### A3. Landscape / horizontal capture  [M, MED risk]
**Problem (FIXES-NEEDED #3):** phone rotates but the user can't actually shoot
in landscape; wide menus don't fit portrait.
**Files:** `src/screens/CaptureScreen.tsx` (preview box aspect + layout),
`src/index.css` (orientation media query), `src/lib/camera.ts` (no change if A1
makes preview track-driven).
**Approach:**
  - After A1 the preview already follows the real track aspect ratio, so a
    landscape sensor previews landscape. Add `@media (orientation: landscape)`
    layout so controls sit beside the preview instead of below (no overlap, keep
    touch targets >=64px).
  - Capture is orientation-agnostic once A1 lands (full honest frame). Confirm
    EXIF/rotation: canvas capture bakes in display orientation, so no rotated
    JPEGs.
**Acceptance:** rotate to landscape, frame a wide menu, capture — saved photo is
landscape and upright; controls reachable; VoiceOver order still logical.

> Sequence inside A: **A1 → A2 → A3** (A1 is the foundation both others depend
> on). Commit after each. ~Half a day total.

---

## Workstream B — Remaining VoiceOver items (VOICEOVER-AUDIT.md)

### B1. P1-4 — Mic transcription feedback is TTS-only  [S, LOW risk]
**Problem:** "I heard: …", "Name updated to X", mic errors go only through
`speak()`; with app-voice off (VoiceOver users) they're silent.
**Files:** `src/screens/LoginScreen.tsx`, `src/screens/OnboardingScreen.tsx`,
`src/screens/SettingsScreen.tsx`.
**Approach:** the `announce(msg){ setSrStatus(msg); speak(msg); }` +
`<p role="status" aria-live="polite">` pattern already added to Saved/Settings.
Replicate it: one status line per screen, route every bare `speak()` for a state
change (incl. mic errors) through `announce()`.
**Acceptance:** with app voice OFF + VoiceOver on, dictate a name / email — the
confirmation is read from the live region.

### B2. P1-3 — Onboarding loses focus on step change  [S, LOW risk]
**Problem:** tapping Next/"Let's begin" unmounts the focused button; focus falls
to `<body>`, VoiceOver stranded (only masked today by app voice).
**Files:** `src/screens/OnboardingScreen.tsx`.
**Approach:** `stepHeadingRef` on each step's heading (`tabIndex={-1}`); in the
existing `useEffect([step])`, focus the new step heading.
**Acceptance:** with app voice off, advance steps — focus lands on the new
question heading each time.

### B3. P1-8 — CaptureScreen double-speak (coach + live region)  [S, LOW risk]
**Problem:** every coaching line is spoken by `coach()` AND read by VoiceOver via
`role="status"`. (Note: `coach()` already self-gates on app-voice, so the
true-VoiceOver case is already fine; this only affects app-voice-ON users.)
**Files:** `src/screens/CaptureScreen.tsx`, import `isAppVoiceOn` from speech.
**Approach:** gate ONLY the scanner-coach status line's `aria-live` to `off`
when app voice is on (keep errors/analysis announcements live). Cleanest: a
separate scanner-status `<p aria-live={appVoiceOn ? 'off' : 'polite'}>` distinct
from the error/analysis status line.
**Acceptance:** app voice on → one voice during scan; app voice off → live region
only.

### B4. P2 polish batch  [S, LOW risk]
`src/App.tsx` unused `#sr-announce` (wire as shared announcer or delete),
P2-2 aria-label on non-interactive divs (give SavedScreen card `role="group"` or
drop), P2-4 swap `disabled` for `aria-disabled`+no-op on buttons that disable
mid-interaction (Conversation action button, Login/Onboarding submits), P2-5
spice/voice pickers → `role="radiogroup"`/`radio`, P2-6 mic "Transcribing…"
label, P2-8 Sign-out two-tap confirm (reuse Saved's pattern), P2-10 root loading
`role="status"`.
**Acceptance:** spot-check each with VoiceOver; no regressions.

---

## Workstream C — REVIEW.md remaining minors

### C1. #13 — Browserless token in URL query string  [S, LOW risk]
**Files:** `api/_menuCore.ts` (~line 94). Send token via
`headers: { Authorization: 'Bearer ' + BROWSERLESS_TOKEN }` instead of
`?token=`; never log `res.url`. Verify Browserless still authenticates.

### C2. #8 — Unbounded body download before size check  [S/M, LOW risk]
**Files:** `api/_menuCore.ts` (PDF ~134-139, HTML branch). Pre-check
`content-length` against MAX_PDF_BYTES; stream via `response.body.getReader()`
with an early abort once the cap is exceeded (protects serverless memory).

### C3. #16 — Telemetry multi-tab / pre-init queue race  [S, LOW risk]
**Files:** `src/lib/telemetry.ts`. Merge instead of overwrite
(`_queue = [...restore(), ..._queue]`); namespace the localStorage queue key per
session id; clean up stale session keys on init. Prevents two tabs double-sending
and dropping pre-init events.

> C items are independent and safe; can be done in one sitting (~1-2h) and one
> commit each. No user-visible behavior change beyond correctness.

---

## Workstream E — Content / copy (FIXES-NEEDED "Em-Dash Removal: Still TODO")

App-facing copy is already em-dash-free (the VoiceOver-breaking case, per the
no-em-dash rule). What remains:

### E1. Website em-dashes — USER-FACING  [S, LOW risk]  ← worth doing
**Files:** `public/website/index.html` (~11), `menuvoice-site/v3/index.html`,
`website/styles.css` copy, `dist/website/*` (regenerated, ignore).
**Approach:** replace `—` with periods / restructured sentences, same as the app
sweep. Also apply the no-AI-slop content rule while in there (no salesy/
unverified claims). Verify which website dir is the deployed one before editing.
**Acceptance:** no `—` in the served marketing copy; tone stays factual.

### E2. Code comments + planning .md docs em-dashes — COSMETIC  [optional]
~280 occurrences across `src/*` comments, `api/*` comments, and docs
(PROGRESS, IDEAS, REVIEW, etc.). These are NOT user-facing and do NOT affect
VoiceOver, so this is optional cleanup only. Skip unless you want consistency.

---

## Workstream D — Ops / verification (not code I can fully close)

### D1. Smoke-test 404s  [BLOCKED on you]
SMOKE-RESULTS.md chain-restaurant failures trace to an exhausted/expired
`BROWSERLESS_TOKEN`. **Needs you to renew the token** and set it in Vercel env.
Then I re-run `node scripts/smoke-restaurants.mjs` against the new deploy and
record results. Until renewed, JS-shell pages fall back to the friendly 422 and
find-by-name (web search) covers those restaurants.

### D2. Real-device VoiceOver pass  [you + me]
The heading-rotor, speaking-page, and zoom/landscape work want a live iOS +
VoiceOver test. I can drive a headless browser (`/qa` or `/browse` skill) for
runtime errors + screenshots, but the actual VoiceOver rotor behavior needs a
real iPhone. Recommend a 20-min pass after Workstream A lands.

### D3. Scanner thresholds  [deferred, needs real lighting]
PROGRESS.md note: LUM_DARK / SHARP_MIN / EDGE_MIN in scanner.ts were tuned on
theory. Adjust after one real restaurant-lighting capture session.

---

## Recommended execution order

1. **C1, C3** (quick, safe, zero UX risk) — clears the easy REVIEW backlog.
2. **B1, B2, B3** (VoiceOver friction, low risk, high user value).
3. **A1 → A2 → A3** (camera; the big chunk; commit per step; QA on device).
4. **C2** (streamed size cap).
5. **B4** (P2 polish).
6. **D1/D2** with you (token renewal + device pass), then final deploy verify.

Every step: `npm run build` green, atomic commit, push. After A and B,
re-run a headless QA pass and update PROGRESS.md + FIXES-NEEDED.md status lines.

### Rough total
- Quick wins (C1, C3, B1, B2, B3): ~half a day.
- Camera (A1-A3): ~half a day + device QA.
- Remainder (C2, B4): ~2-3h.
- → ~1.5-2 focused days to fully close, minus D1 which is gated on the token.
