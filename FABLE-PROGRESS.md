# FABLE-PROGRESS — One-Window Audit Run

Run date: 2026-07-03 · Unattended cloud session (Claude Code remote environment)

## Run conditions — read this first

- **This was an UNATTENDED cloud run. No real human assistive-tech testers
  (blind VoiceOver / TalkBack / low-vision users) were available.** Nothing in
  this document is a real user quote. Anywhere tester reactions appear, they
  are explicitly labeled **simulated/analytical** — they are predictions from
  code review and headless-browser behavior, not observations of real people.
- **The runbook file `FABLE-ONE-WINDOW-RUNBOOK.md` does not exist in this
  repository** — not at the repo root on `main`, not on the `side` branch, not
  anywhere in git history. The task was reconstructed from the dispatch
  instructions, which specified: (1) a rigorous code + flow review of the
  voice-first path, speech/VoiceOver overlap risks, allergen-trust wording,
  and restaurant/menu-source confirmation, grounded in AGENTS.md, PRODUCT.md,
  FIXES-NEEDED.md, VOICEOVER-AUDIT.md, scripts/a11y/REPORT.md, and
  PROGRESS.md; and (2) a headless-browser dogfood of the deployed app.
- Production URL for this run: https://menuvoice-sigma.vercel.app
- Real-device VoiceOver/TalkBack verification (FIXES-NEEDED D4) remains open
  and cannot be closed by this run.

## Progress log

### Step 1 — Orientation (done)
- Confirmed runbook missing (searched working tree, `main`, `side`, full git
  history). Recorded above; proceeding with reconstructed scope.
- Read all six grounding docs: AGENTS.md, PRODUCT.md, FIXES-NEEDED.md,
  VOICEOVER-AUDIT.md, scripts/a11y/REPORT.md, PROGRESS.md.
- Key context: FIXES-NEEDED (2026-06-18) tracks B1/B3/B7 as *partial*,
  B10 voice confirmation as *not implemented*, D3 (production `incomplete`
  flag) as *blocked on deployed URL* — this run has that URL and will check.
- PROGRESS.md bottom section describes a provenance/allergen-confidence
  feature branch; that work is merged into `main`. Remote branch `side`
  (open PR #7) carries unmerged camera-quality work.

### Step 2 — Production URL unreachable from this environment (done)
- `https://menuvoice-sigma.vercel.app` could not be reached from the cloud
  sandbox: the outbound proxy's network policy answers **403 to CONNECT** for
  that host, and the harness web fetcher also received **HTTP 403**.
- Consequence: the dogfood ran against a **local production build of `main`**
  (`vite build` + `vite preview`) driven by headless Chromium instead of the
  live deploy. Heading structure, live regions, focus management, and
  client-side flows are identical to the deploy (same bundle); what could NOT
  be verified live: Vercel serverless responses (notably FIXES-NEEDED D3,
  whether `menu.incomplete` reaches production JSON), OAuth origin, and real
  API latency. Those remain open items for a run with network access.
- Silver lining: with no backend, the find/menu flows fail for real, which
  exercised the failure/recovery announcements exactly as a user on broken
  restaurant Wi-Fi would hit them.

### Step 3 — Code + flow review, two parallel deep passes (done)
Two independent review passes over `main`: (a) app-TTS vs screen-reader
overlap, live regions, focus management; (b) allergen-trust wording and
restaurant/menu-source confirmation. Every FIXES-NEEDED status claim was
checked against the actual code. Full findings in the "Findings" section
below; headline: the B-item statuses in FIXES-NEEDED.md are broadly honest
(B2, P0-3, D2-main-path, two-tap confirms, radio semantics all verified
real), but three safety-relevant gaps and one P0 regression were found.

### Step 4 — Headless-browser dogfood (done)
- Built `main` for production (`npm run build`, green) and served it with
  `vite preview`; drove it with headless Chromium (puppeteer) at iPhone
  viewport, simulating what a screen reader receives: heading outline (rotor),
  live-region mutations (MutationObserver with timestamps), focus tracking,
  and every app-TTS utterance (speechSynthesis + audio-element stubs).
- Scenarios exercised: fresh login; onboarding; home; find (empty submit,
  failing search); saved list (two-tap delete); conversation on a seeded
  saved restaurant with provenance + incomplete flag + allergen-bearing
  dishes (peanuts/shellfish profile); browse mode; settings (radio groups,
  misspelled-allergy save, sign-out); capture with no camera; and the whole
  app with `appVoice: false`.
- Artifacts: dogfood script + JSON report kept in the session scratchpad
  (not committed — they contain nothing not summarized here).

### Step 5 — What the dogfood verified as WORKING
- **App-voice gate (B1 core):** with `appVoice: false`, zero TTS utterances
  fired across navigation, and the global `role="status"` page region still
  announced every screen change ("Find menu screen. Enter a restaurant name
  and city…"). The gate reads localStorage synchronously, so it holds from
  first paint.
- **Heading rotor per screen:** exactly one h1 per screen everywhere
  (Login: h1 MenuVoice/h2 Login; Find: h1 Find a menu; Saved: h1 Saved
  restaurants; Conversation: h1 restaurant name; Settings: h1 + one h2 per
  section; Capture: h1 Capture menu).
- **Touch targets:** no interactive element under 44px found on any screen
  (project targets 64px; nothing small slipped through).
- **Failure paths announce and offer recovery:** mic denied on Login →
  status region "I could not access the microphone. Please type your email
  address."; camera unavailable on Capture → `role="alert"` with honest
  recovery copy including the upload-from-library fallback; mic denied on
  Conversation → `role="alert"` "…allow microphone access, then tap Try
  again."; empty Find submit → announced "Please type a restaurant name or
  paste a link first." (the P1-7 fix is real — the button stays reachable).
- **Safety-honesty features fire in the right order:** opening speech says
  "This wasn't a complete menu." FIRST, the banner with "Add menu photos" is
  the first thing after the h1, and the provenance note ("this menu is from
  an official source though I could not confirm it is specific to your
  branch") is spoken in the opening.
- **Settings semantics:** Spice and Voice pickers are real radiogroups
  (10 radios); allergy save announced in DOM + speech, including
  normalization: typing "peanutts, glooten" produced "Saved. I corrected
  peanutts to peanuts, glooten to gluten. I will warn you about peanuts,
  gluten." Sign-out is two-tap with a DOM announcement. Saved-restaurant
  delete is two-tap with DOM announcement ("Delete Mario's Pizza? Tap
  Delete again to confirm.").
- **P0-2 fix present where claimed:** the phase indicator flips to
  `aria-live="off"` while recording ("Listening. Tap Done talking when
  finished" was logged at `off`, not `polite`).

## Findings — ranked for a blind user at a restaurant table

Severity legend: S1 = safety/trust, S2 = breaks the core loop, S3 = friction.

### S1-1. Browse mode claims dishes with ANY of your allergens are hidden — but only 9 allergen groups are detectable
`ConversationScreen.tsx:153-156` announces "Dishes that may contain your
allergens ({list}) are hidden" for the user's whole allergy list, while
detection (`src/lib/allergens.ts`) covers only dairy, egg, gluten, peanut,
tree nut, soy, fish, shellfish, sesame. The profile normalizer
(`src/util.ts:36-41`) happily accepts mustard, celery, sulfites, coconut,
corn, garlic, onion, cinnamon. A user with a mustard allergy is told mustard
dishes are hidden; none are, and no disclaimer appears. This is a false
safety claim — worse than no claim. Fix direction: scope the sentence to the
allergens the detector actually knows, and say explicitly which listed
allergies it cannot screen for.

### S1-2. Silent allergy autocorrect can remap to a DIFFERENT allergen; onboarding discards corrections (B8 still open)
`src/util.ts:83-88` maps edit-distance ≤2 for words >5 chars: dictated
"custard" becomes "mustard" with no confirmation. Settings at least
announces corrections after saving; Onboarding (`OnboardingScreen.tsx:58`)
throws the corrections array away entirely. FIXES-NEEDED B8's "ask for
confirmation when uncertain" is not implemented anywhere. Compounds with
S1-1 (mustard is undetectable anyway). No tests cover
`correctAllergen`/`normalizeAllergens`.

### S1-3. Pasted-URL flow saves and opens with zero restaurant confirmation (B10 bypass), and voice confirmation doesn't exist at all
`FindScreen.tsx:181-196`: the URL path calls `saveRestaurant` + `navigate`
immediately — no confirm card, unlike the name-search path. And the confirm
card itself (`:307-334`) is touch-only: FindScreen has no speech recognition,
so "Is this the right place?" is a spoken yes/no question a voice-first user
cannot answer by voice (FIXES-NEEDED B10 "voice yes/no not implemented" is
accurate). A same-name/same-location save also REPLACES the existing entry
(`storage.ts:138-140`), so one bad URL parse can overwrite a good saved menu.

### S1-4. Supplement-photos flow launders provenance
"Add menu photos" on an incomplete third-party menu re-stamps the merged
result as `sourceType:'photo', official: true, location_specific,
checkedAt: now` (`CaptureScreen.tsx:354-380`), and `mergeMenus` re-judges
`incomplete` from the new photos alone while keeping a stale
`incompleteReason`. An old DoorDash menu plus one photo of the dessert page
becomes "an official menu, checked today." Same code path marks
uploaded-from-library photos (possibly an old screenshot) as checked-today.

### S2-1. P0-2 (VoiceOver spoken into the open mic) has regressed through the new reply-summary region
The sr-only conversation summary (`ConversationScreen.tsx:725-731`,
`aria-live="polite"` + `aria-atomic="true"`) re-announces the ENTIRE growing
reply on every streamed token. Dogfood timing: the full "MenuVoice said: …"
announcement was queued at `polite` ~270ms before the phase flipped to
recording; flipping the region to `off` at recording does not cancel speech
VoiceOver already queued, and the mic auto-opens 150ms after the earcon
(`:387-391`). VoiceOver's own voice lands in the recognizer and the app
answers it — the exact loop P0-2 was supposed to close. The same region also
double-speaks every reply when app voice is on (it is not gated on
`isAppVoiceOn()` the way the Capture coach region is).

### S2-2. iOS cancel-then-speak drop fixed for coach(), still present in speak()'s browser fallback (C4 half-fixed)
`speak()` → `stopSpeaking()` → `speechSynthesis.cancel()` (`speech.ts:116`)
then `playBrowser()` speaks in the same tick (`speech.ts:200-213`). Whenever
OpenAI TTS is unavailable (no key, API error → fallback), iOS Safari can
silently swallow the utterance: onboarding prompts, Find intro, and error
messages randomly never play on the primary platform. `coach()` got the
60ms-deferral fix (`speech.ts:254-265`); `speak()` did not.

### S2-3. Pause Voice does not gate NEW speech, and dictation recorders ignore it (B7 holes)
`speak()` has no paused check — navigate while paused and the next screen's
mount intro talks anyway (e.g. `FindScreen.tsx:121`). The MediaRecorder
dictation flows on Login/Onboarding/Settings never call
`registerStopListening`, so "Pause Voice" while dictating your name keeps
the mic recording up to the 30s cap. Only Conversation and Capture are
properly pause-aware.

### S2-4. Malformed menu JSON from the photo path is spoken as a raw TypeError; no error boundary anywhere
`openai.ts:118-129` validates only that `categories.length > 0`; a category
without `items` throws in `CaptureScreen.tsx:355` and the caught message —
"Cannot read properties of undefined (reading 'length')" — is SPOKEN to the
user. If it survives to render, `MenuDocument` crashes and there is no React
error boundary (`main.tsx`/`App.tsx`) → silent white screen. The server
paths have `sanitizeMenu` (`api/_menuCore.ts:492-527`); the client photo
path does not use it. (C2 is fixed server-side only.)

### S2-5. Raw exception text reaches speech on the Find path
`FindScreen.tsx:231`: `const message = e?.message ?? fallback` — `??` only
catches nullish, and every Error has a message. Restaurant Wi-Fi drop →
the user hears "Failed to fetch." Also: the `found:false` branch of
`api/find-menu.ts:176-181` still returns the model-generated `reason`
verbatim (D2 fixed only the found-but-unreadable branch), and the
localhost-only "Set OPENAI_API_KEY in Vercel environment variables"
developer copy ships in the user-facing bundle (`FindScreen.tsx:170`).

### S3-1. Screen-entry is still up to three voices (B6 unresolved — matches FIXES-NEEDED)
With app voice on (the default) + VoiceOver: mount-time `speak()` + VoiceOver
reading the newly-focused `<main>` + the always-on global page-status region
(`App.tsx:87-94`) all fire on every navigation. Dogfood confirmed both DOM
channels update and TTS fires on the same transition. The `announce()`
pattern (speak + polite region) double-speaks every state change for
VoiceOver users app-wide; only Capture's coach region and Conversation's
recording state are gated. B1 is only a fix for users who find the toggle.

### S3-2. Capture still double-speaks half its messages (B4 incomplete)
The coach region is gated (`CaptureScreen.tsx:476`) but the second,
always-live region (`:480`) receives messages that are ALSO spoken: photo
confirmations ("Got it, photo 1…"), the every-5s analysis reassurance, zoom
announcements, upload results.

### S3-3. Heading rotor inside the menu: categories are buttons, not headings; dish h3 stops exist only after expanding
Browse mode renders collapsed `aria-expanded` category BUTTONS under one h2
("Menu categories"). Dogfood rotor sweep found no category or dish headings
until a category is expanded. Disclosure semantics are legitimate, but the
celebrated "h2 category → h3 dish" rotor model (PROGRESS.md, FIXES-NEEDED
"Done" list) no longer matches the shipped structure; a heading-rotor user
finds nothing between the restaurant name and "Menu categories."

### S3-4. Opening line is still numeric ("I found 2 sections on this menu: Starters, and Pasta.") — B13 not started
Dogfood heard exactly the count-style copy B13 says to replace with
restaurant-first copy. Recorded here because the spoken counts also push the
allergen/provenance notes later in the opening.

### S3-5. Long waits hard-disable the buttons under VoiceOver focus
Find ("Find menu", input, during the up-to-60s search) and Capture (all five
controls during analysis) use `disabled`, dropping VoiceOver focus to body
for the whole wait — the P2-4 `aria-disabled` pattern was applied only to
Conversation. Settings/Login/Onboarding mic buttons have the same issue.

### S3-6. Speak-only messages that vanish with app voice off
Login: empty-email nudge, Google welcome/failure (`LoginScreen.tsx:56,72,75,82,151`);
Saved: "You have 1 saved restaurant" (confirmed speak-only in dogfood);
Find: "What are you doing?" repeats status via speak() only (`:296`);
Onboarding: the farewell that CONFIRMS THE SAVED ALLERGIES races its own
unmount (`OnboardingScreen.tsx:53-66`) and exists in no DOM node. That last
one is safety-adjacent: the user may never hear which allergies were saved.

### S3-7. Smaller items
- "nuts" normalizes to tree nuts only — peanut dishes are not blocked for a
  user who said "nuts" (`util.ts:46-47` vs `allergens.ts:55`).
- Allergen keyword lists miss common carriers (alfredo/queso/ricotta for
  dairy; tortilla/ramen/tempura for gluten; mahi/unagi for fish) — "Chicken
  Alfredo" draws no dairy disclaimer.
- Settings dictation announces "Listening for your name" AFTER opening the
  recorder — the app narrates into its own mic and can transcribe itself.
- Chat receives the full menu including blocked dishes; the flag-first
  allergen rule is enforced by prompt only, with a 220-token reply cap that
  can truncate mid-warning.
- Tap-anywhere-to-interrupt (B7a) is inert under VoiceOver proper (taps
  land on focused elements); acceptable because the labeled interrupt
  button remains, but the acceptance criterion will not pass on device.

## Confirmed-good list (for balance)
Verified real in code AND exercised in the browser where applicable:
appVoice gate; incomplete-menu honesty (first in speech + banner + "Add menu
photos"); provenance spoken in the opening and answerable by voice intents
from metadata (not the LLM); conservative allergen disclaimer wording with
tests ("The restaurant lists X." vs "may contain X … not confirmed" +
"Please confirm with the restaurant."); hard never-call-it-safe system-prompt
rules; blocked dishes removed entirely from browse; D2 fixed copy on the
found-but-unreadable path; server-side sanitizeMenu; SSRF guard; two-tap
delete and sign-out; radio semantics; correction-announcing allergy save;
single h1 per screen; ≥64px targets; honest camera/mic failure alerts with
recovery actions; P1-7 empty-submit announce; stage narration landing in the
status region (P0-3).

## Simulated tester reactions — NOT real users
**These are analytical predictions written by the auditing agent from code
review and headless-browser evidence. No blind or low-vision person was
involved in this run. Do not quote these as user feedback.**

- *Simulated iPhone VoiceOver user, restaurant table:* the first minutes are
  the roughest — every screen change produces the app voice and VoiceOver
  talking at once until they discover the Settings toggle (predicted from
  S3-1; the first-launch hint about the toggle exists only as speech). In
  conversation mode, VoiceOver reading "MenuVoice said: …" into the auto-open
  mic (S2-1) would present as "the app keeps answering questions I didn't
  ask" — the single most likely abandon-point.
- *Simulated VoiceOver user with a mustard allergy:* would reasonably trust
  "dishes that may contain your allergens are hidden" and order from the
  browse list without asking staff (S1-1). This is the finding I would not
  ship past.
- *Simulated low-vision user, no screen reader, spotty Wi-Fi:* generally
  well served — big targets, honest failure copy with next steps — but would
  hear "Failed to fetch" (S2-5) and, on iOS with TTS fallback, occasional
  unexplained silence (S2-2).

## What this run could NOT verify (open)
- Anything requiring the live deploy: D3 (`menu.incomplete` in production
  JSON), OAuth origin, serverless env vars, real find-menu latency —
  blocked by the sandbox network policy (Step 2).
- Real-device VoiceOver/TalkBack behavior (rotor gestures, queued-speech
  timing, earcon audibility) — FIXES-NEEDED D4 remains the gate before
  claiming any of the S2 items fixed.
- iOS Safari speech quirks (S2-2) — reproduced by code reading, not device.

## Recommended next actions (priority order)
1. S1-1: scope the "hidden allergens" claim to detectable groups; name the
   ones it cannot screen. Small copy+logic fix, highest trust impact.
2. S2-1: gate the reply-summary region on `isAppVoiceOn()` and keep it `off`
   from the moment a reply starts streaming until after the mic closes.
3. S1-2: confirm uncertain allergy corrections ("Did you mean mustard?");
   surface corrections in onboarding, not just Settings.
4. S1-3: run the confirm card on the URL path too; add voice yes/no.
5. S2-2: apply coach()'s 60ms deferral inside playBrowser().
6. S2-4/S2-5: client-side sanitizeMenu + friendly-message allowlist before
   anything is spoken; add a React error boundary that speaks.
7. Then B6 as designed in FIXES-NEEDED (one announcement model) — it
   resolves S3-1/S3-2 wholesale rather than region-by-region.

## Final Fable Summary

**Run:** unattended cloud audit, 2026-07-03. No human testers; runbook file
absent (task reconstructed from dispatch instructions — see top of file).
**Method:** two deep code-review passes over `main` (speech/VoiceOver
overlap + focus; allergen trust + source confirmation) grounded in the six
planning docs, plus a headless-Chromium dogfood of a local production build
across 8 scenarios simulating screen-reader-relevant signals. The live
deploy at menuvoice-sigma.vercel.app was unreachable from the sandbox
(network policy), so production-only checks remain open.

**Verdict:** the accessibility foundation is real, not aspirational — the
app-voice gate, incomplete-menu honesty, provenance speech, conservative
allergen disclaimers, two-tap destructive actions, and failure-path alerts
all verified working in the built app. But the run found four safety/trust
gaps (false "allergens hidden" claim S1-1, silent allergy remapping S1-2,
unconfirmed URL-flow saves S1-3, provenance laundering S1-4) and one P0
regression (VoiceOver-into-open-mic via the reply-summary live region,
S2-1) that together mean the app should not yet be represented as safe for
unassisted use by blind users with food allergies. The fixes are small and
localized; the top three are copy/gating changes, not architecture. The
zero-violation axe report (scripts/a11y/REPORT.md) is accurate but measures
the wrong layer — every finding above is invisible to static WCAG scans and
only appears in the interaction between app TTS, live regions, and an open
microphone. Real-device VoiceOver testing (D4) is still the gate: nothing
in this run substitutes for it, and S2-1/S2-2 in particular need device
confirmation before and after their fixes.

