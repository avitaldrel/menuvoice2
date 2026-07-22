# MenuVoice — Bugs Fixed

Session date: 2026-07-21
Branch: `fixing-the-remianing-bugs` (based on `upstream/main` at `9cc52b8`)
Source: `MENUVOICE-INTERNAL-BUGS-TO-FIX.md` (reviewed 2026-07-19)

15 commits, 14 of the 16 numbered bugs addressed. All work is local to this
branch and has not been pushed. Full test suite: 136 tests passing, both
`tsc` typechecks (app + api) clean throughout.

---

## 1. Stop partial menus from being presented as complete

**Priority:** Critical · **Commit:** `8ad0548`

Search accepted a 3-item result and a pasted URL accepted anything with 1 item,
then called it "complete" unless the AI model happened to flag otherwise.

- Added `assessMenuCompleteness()` in `api/_menuCore.ts` — deterministic checks
  (item count, section count, source quality, page-truncation cues, sections
  named in the text but missing from the menu) that run *in addition to* the
  model's own judgment and can only ever move a menu toward "incomplete."
- Both read routes (`find-menu.ts`, `menu-from-url.ts`) now use it.
- Partial menus say so outright: *"I found only part of this menu"* instead of
  the softer "it may be incomplete."
- Tests cover the exact 3- and 5-item fragments from the report.

## 2. Detect every allergy the profile accepts + fix the retype dead-end

**Priority:** Critical · **Commits:** `7e90853`, `ac5315e`

**2a.** The profile accepted `corn`, `garlic`, `onion`, `cinnamon` but
`allergens.ts` had no detection group for any of them — saving the
restriction produced zero warnings. Added a group for each (onion also covers
shallot/leek/scallion/chive), marked "personal-only" so they warn only the
people who listed them.

**2b.** Choosing "Remove it" on an unrecognized word advanced the review and
could finish onboarding/Settings without ever letting the user correct what
was almost always a typo. The action is now "Remove and retype": drops just
that word, keeps every other allergy, returns to the field with focus on it,
and announces the removal. Fixed identically in Onboarding and Settings.

## 3. Rate limiting on expensive server routes

**Priority:** High · **Commit:** `fe4a9cd`

No route enforced any per-user limit on AI/search/transcription/speech calls.

- `api/_rateLimit.ts`: rolling-window budget per caller (session, else IP) per
  route. An identical back-to-back request is bounced *without spending the
  budget* (the stuck-button case).
- Deliberately generous, not a daily allowance — a 5-minute conversation at a
  turn every couple of seconds stays well inside the limit. 429 + `Retry-After`
  with a calm message naming the wait ("about 30 seconds"); no lockout.
- Fails **open** on any storage error — a broken limiter shouldn't break the app.
- `chat.ts` (Edge runtime) got its own variant since it has no `node:crypto`.

## 5. Make Dark the default; redesign High Contrast

**Priority:** High · **Commit:** `b0d42f3`

New profiles defaulted to the white Light theme; High Contrast used bright
neon yellow instead of MenuVoice's own identity.

- Default flipped to `dark` in the initial profile, the pre-paint anti-flash
  script, and both fallback reads — a theme the user already saved is always
  preserved.
- High Contrast now uses white text and MenuVoice orange (`#ffb454`) instead
  of yellow, on pure black — keeps the brand while staying maximally readable.

## 6. Text enlargement and reflow

**Priority:** High · **Commit:** `db68bb7`

Only 3 text-size steps existed (100/118/140%), short of the requested ~200%
ceiling.

- Added a 4th "Maximum" step; the four now land on 100/125/150/200%.
- Audited the rest of the requirement: line-height already 1.58 (≥1.5 required),
  no font-weight anywhere below 400, reading content capped at 560px.
- Verified live at 200% on a 390px mobile viewport: zero horizontal overflow on
  Home, the Read-a-Menu chooser, Settings, the full Tutorial, and Conversation.
- **Known gap, flagged not fixed:** font sizing is `calc(Npx * scale)` — an
  absolute unit that only responds to MenuVoice's own control, not a separate
  OS-level "larger text" preference (distinct from full-page zoom, which
  already works). Converting every font-size to `rem` would fix this but is a
  much larger, higher-risk mechanical change across dozens of components —
  out of scope for this pass.

## 7. Replace unreliable VoiceOver detection

**Priority:** Medium · **No code change**

Searched every plausible naming pattern (`voiceOver`, `screenReader`,
`a11yMode`, `touchstart`/`focusin` heuristics, etc.) across the codebase and
git history. No such feature exists in this codebase — nothing to remove.
Reporting as already satisfied rather than fabricating a diff.

## 8. Pause Voice only on the Conversation screen

**Priority:** High · **Commit:** `cf2c20f`

The floating Pause Voice button rendered on every screen even though nothing
outside Conversation ever talks or listens. Gated on `current.name ===
'conversation'`. Verified absent on Home/Settings/Capture, present and
correctly labeled on Conversation.

## 9. No app-generated speech outside Conversation Mode

**Priority:** High · **Commit:** `eff77fe`

Audit, not a behavior change — the app was already compliant. Traced every
call into the speech layer: `speak()`/`createStreamingSpeech()` (the two
functions that produce audible content) are imported only by
`ConversationScreen.tsx`. The other `speechSynthesis.speak()` sites are silent
`volume:0` priming utterances for the mobile autoplay gate, not real speech.

Verified live: instrumented `speechSynthesis.speak`/`Audio()` in the running
app — Home, Settings, and Saved produced only silent priming calls; opening a
saved restaurant into Conversation produced a real spoken reply.

Added `tests/speechScope.test.ts` as a permanent regression guard (fails if any
future change imports real speech into a non-Conversation screen).

## 10. Remove Settings mic features and unnecessary profile options

**Priority:** High · **Commit:** `45ee78b`

Removed the "Speak your name" / "Speak a food to add to dislikes" mic buttons
and their MediaRecorder/transcription flow (name and dislike fields stay as
plain text inputs). Removed Spice tolerance entirely — profile field,
default, Settings UI, and the clause in the Conversation system prompt.

Kept Foods you dislike/love, Hide prices, and the photo-upload preference,
reviewed individually rather than stripped wholesale, per the report.

Verified live with a seeded **legacy profile** carrying a stray
`spiceTolerance` value — loads with zero errors, confirming old profiles
survive the removal safely.

## 11. Make order specification optional, never mandatory

**Priority:** Medium · **Commit:** `c176a31`

The Conversation system prompt instructed MenuVoice to *proactively ask* "what
have you decided" near the end of most conversations — exactly the forced
confirmation the report asks to remove.

- Rewritten to be purely reactive: MenuVoice never asks; if the guest
  volunteers a decision, it briefly confirms in one sentence; otherwise it
  says nothing and never nudges.
- Tightened the end-of-session extraction prompt so discussion/comparison no
  longer risks being saved as a decided order.
- The Demo Menu is practice, not a dining decision — `ConversationScreen` now
  skips learning-extraction and dining-history entirely for it.
- Added a "Dishes you've ordered before" review/remove section in Settings.
- Along the way: fixed a latent bug where `lib/openai.ts` read
  `import.meta.env` without optional chaining, crashing if ever loaded outside
  Vite — which is also what made this testable at all.

## 12. Prove preference learning end to end

**Priority:** Medium · **Commit:** `f2721b6`

Bug #11 fixed the behavior; this proves it against the **real model**, since
the relevant functions can't run under the plain Node test runner. Ran two
ways: directly in the running app's browser console (importing the real
compiled module with a live API key), and via a new standalone script,
`scripts/verify-order-learning.mjs`, that anyone can re-run later. Both
confirmed every acceptance criterion:

- "I'll get the salmon" → `orders: ["salmon"]`
- Asking about ingredients/allergens, "just checking" → `orders: []`
- An unconfirmed recommendation ("I'll think about it") → `orders: []`
- "Remember that I chose the pasta" → `orders: ["pasta"]`
- At an unrelated restaurant, a past order surfaced as a soft, non-forced
  steer toward a relevant dish — never a literal demand for a dish not on
  the menu
- Mid-conversation, an explicit decision produced exactly one warm
  confirmation sentence

## 13. Shorten the first-run tutorial

**Priority:** High · **Commit:** `3329a85`

First-run showed all 6 steps at once, including Pause Voice and appearance
settings before the user had opened a menu. Added a separate 3-step
`FIRST_RUN_STEPS` list (get the menu / talk-or-browse choice / allergy
safety), one sentence each. The full 6-step list is unchanged and now lives
exclusively in "How MenuVoice works," reachable anytime from Home.

## 16. Combine Scan and Find; recommend Scan

**Priority:** High · **Commit:** `849568c`

The single "Read a Menu" → chooser structure the report asked for already
existed; what was missing was the recommendation itself. The chooser now
explains, in one sentence, why scanning your own copy is usually more
accurate (hedged with "usually," never claims perfection). Scan's accessible
name now reads "Scan a Menu. Recommended when you have the menu" as one
combined phrase; Find's now says "Search by name, or paste a link,"
surfacing that capability right in the chooser.

## 20. Make saved restaurants private to the signed-in user

**Priority:** Critical · **Commits:** `a4a6fa1` (local half), `7c26b91` (server half)

**Part 1 — local isolation.** Sign-out reset the profile but left
`menuvoice.savedRestaurants.v1` in localStorage, so the next person on a
shared browser saw the previous user's saves. Added `clearLocalUserData()`
(profile + saved restaurants), called on sign-out and before restoring a
different account at login.

**Part 2 — the actual vulnerability.** `/api/sync` trusted a bare `email`
supplied by the request with zero verification — anyone who knew or guessed
an email could read or overwrite that account's cloud data. Google Sign-In's
ID token was only ever decoded client-side, never checked against Google.

- `api/_auth.ts` (new): verifies Google ID tokens against Google's live JWKS
  (signature, issuer, audience, `email_verified`) using `jose`; mints
  MenuVoice's own signed session token (Google's tokens expire in ~1 hour,
  too short for normal use) for ongoing sync calls. Fails **closed** on any
  error — the opposite of the rate limiter's stance.
- `api/auth-session.ts` (new): exchanges a fresh Google ID token for a session
  token, once, right after sign-in.
- `api/sync.ts`: now requires `Authorization: Bearer <sessionToken>` on every
  call; identity comes *only* from the verified token — the request body's
  `email` field is no longer read at all.
- Email-only login has no verifiable credential and stays local-only by
  design; Google sign-in gets full cloud sync.
- 14 unit tests, including generating a real RSA keypair to act as "Google"
  and proving forged/wrong-audience/expired/tampered tokens are all rejected.
- A live-database harness test runs the actual acceptance test from the
  report — an attacker authenticated as themselves POSTs, naming the victim's
  email in the body; the write lands under the attacker's own account, the
  victim's data is provably untouched. Passed against the real database, rows
  cleaned up after.

---

## Not done — needs a physical iPhone

### 14. Verify Pause/Resume microphone behavior on device
### 15. Real-device camera capture validation

Both require a real camera, real audio output, and real lock/unlock/
app-switch gestures — none of which are available from this environment. A
step-by-step test checklist was prepared covering every scenario in the
original report (pause mid-speech, lock/unlock, app-switch, portrait vs.
landscape, folded/glossy/multi-page/dark/oversized menus, 0.5× fallback) for
whoever runs the physical test pass; results can be fed back for fixes.

---

## Suggested next steps

- Push this branch and open a PR once reviewed.
- Set the new server env vars in Vercel before deploying: `GOOGLE_CLIENT_ID`
  (same value as the existing `VITE_GOOGLE_CLIENT_ID`, without the prefix)
  and a new `SESSION_SECRET` (a long random string, not reused from anywhere
  else).
- Run the #14/#15 device checklist and report back any failures.
