# PROGRESS — running worklog

Companion to PLAN.md. Newest entries at the bottom. If a session ends mid-task,
the "LEFT OFF" line at the bottom says exactly where.

## 2026-06-11

- [x] Scanned full menuvoice2 codebase + menuvoice 3 experiment.
- [x] Confirmed OpenAI Responses API `web_search` tool shape (`tools: [{type:"web_search"}]`).
- [x] Wrote PLAN.md with the five improvements.
- [x] 1. New guided scanner `src/lib/scanner.ts` (glare + blur + coverage + directional
      hints + best-shot fallback); deleted `autocapture.ts`; CaptureScreen wired;
      guidance states tracked to DB.
- [x] 2. Server menu pipeline: `api/_menuCore.ts` (fetch/classify HTML|PDF|image,
      JS-shell Browserless fallback, one menu-link hop, OpenAI extraction with PDF
      file input), `api/menu-from-url.ts`, `api/find-menu.ts` (web_search two-stage).
      vercel.json maxDuration 60 for both.
- [x] 3. `FindScreen` (find menu by restaurant NAME), Home redesigned
      (Find a Restaurant / Scan a Menu / Saved / Website Link), UrlScreen now one
      server call + PDF-capable copy, `find` route added.
- [x] 4. MenuDocument heading hierarchy: h1 restaurant → h2 category (+item count)
      → h3 dish (name + price, one rotor stop) → h4 Description / Ingredients.
      `.browse-item-sub` CSS added.
- [x] 5. Telemetry: added saved open/delete, url submit, find search, scanner
      guidance, conversation mode_toggle. find/parse tracked in openai.ts.

### Verification results (all live, 2026-06-11 late evening)
- `scripts/test-db.mjs`: schema ✔, insert ✔, read-back ✔, cleanup ✔.
- End-to-end: POST to PRODUCTION /api/events → row visible in Postgres → cleaned up. ✔
- `scripts/test-find-menu.mjs`: gpt-5.4-mini + web_search found McAlister's Deli,
  menu URL + 10 items in 6s. ✔ (Stage-2 URL fetch matters: search snippets often
  lack prices.)
- Production /api/chat health check: 200, real completion. Server OPENAI_API_KEY
  in production is VALID.
- **Note:** `OPENAI_API_KEY` in local `.env.local` is STALE/revoked (401). Re-run
  `vercel env pull` before local server testing. Production unaffected.
- `npm run build` green; api/*.ts type-check clean.

### Production smoke tests (after deploy, 2026-06-11 ~23:35)
- Hit ERR_MODULE_NOT_FOUND on first deploy: ESM runtime needs explicit `.js`
  extension on the `./_menuCore` import. Fixed in 6a2c4e9. Lesson recorded.
- POST /api/find-menu {"query":"Chipotle Mexican Grill"} → 200 in 11s, full menu
  with descriptions + ingredients, via stage-1 web search. ✔
- POST /api/menu-from-url with Chipotle's PDF menu → 200 in 13s, structured menu
  parsed from the PDF (proves fetchMenuSource + parseMenuSource, the same code
  stage 2 uses). ✔
- JS-shell pages (e.g. mcalistersdeli.com/menu) return the friendly 422 fast —
  Browserless fallback appears inactive (token may be exhausted). Find-by-name
  covers those restaurants via web search instead.

### Known follow-ups (not blocking the prototype)
- `api/scrape.ts` is now unused by the client (replaced by menu-from-url). Kept
  for backward compat; delete once confirmed nothing else calls it.
- Events table was almost empty before today — production telemetry only started
  landing recently; watch counts after next real session.
- Scanner thresholds (LUM_DARK, SHARP_MIN, EDGE_MIN in scanner.ts) tuned on
  theory; adjust after a real-device test in restaurant lighting.

## 2026-06-12

### Incomplete-menu honesty + supplement flow (user-requested)
- [x] `ParsedMenu.incomplete?: boolean` added (src/types.ts + api/_menuCore.ts).
      Every parse path now asks the model to judge completeness: photo OCR
      (openai.ts), URL/PDF pipeline (_menuCore.ts PARSE_INSTRUCTIONS), and
      find-by-name web search (find-menu.ts FIND_JSON_SHAPE).
- [x] Opening speech: when incomplete, says EXACTLY "This wasn't a complete
      menu." FIRST, one sentence, then the normal section overview
      (buildOpeningLine).
- [x] Results page: banner at the very top — the same one sentence plus an
      "Add menu photos" button.
- [x] Add-photos flow: capture route takes `appendTo`; CaptureScreen merges the
      new parse into the existing menu (mergeMenus: items join matching
      categories by name, dedupe by item name; incomplete flag re-judged from
      the new photos).
- [x] Chat system prompt warns the assistant the menu is partial so it doesn't
      overclaim and suggests adding photos.

### VoiceOver P0/P1 fixes (from VOICEOVER-AUDIT.md)
- [x] ConversationScreen phase indicator: aria-live OFF while recording so
      VoiceOver isn't transcribed by the open mic (P0 #2).
- [x] FindScreen + CaptureScreen reassurance phrases now also land in the
      role="status" region, not TTS-only (P0 #3).
- [x] Heading order fixed: page h1 = restaurant, menu section starts at
      h2 "Full menu" → h2 categories → h3 dishes → h4 details; restaurant no
      longer appears twice in the rotor (P1).

### Sub-agent reports (in repo root)
- VOICEOVER-AUDIT.md — 3 P0 / 9 P1 / 10 P2 findings with code fixes.
  REMAINING P0 #1: app TTS talks over VoiceOver on screen entry; needs a
  profile-level app-voice toggle gating speak() in speech.ts.
- IDEAS.md — prioritized feature backlog (top: allergen flags in browse view,
  voice input for FindScreen, waiter card, GPS-assisted find).
- SMOKE-RESULTS.md + scripts/smoke-restaurants.mjs — production endpoint test
  matrix (agent may still be writing).
- REVIEW.md — code review of the last 3 commits (agent may still be writing).

### Tier 1 fixes from REVIEW.md (2026-06-12, second session, commit f0f725d)
- [x] SSRF guard (REVIEW.md CRITICAL): api/_menuCore.ts assertPublicUrl()
      rejects non-http(s) schemes and localhost/private/link-local/metadata
      hosts before fetchOne(), and re-checks response.url after redirects.
- [x] FindScreen re-entrancy (REVIEW.md major): inFlightRef guard stops
      parallel find() calls / orphaned reassurance intervals.
- [x] Telemetry batch wedging (REVIEW.md major): flush() caps body at 60 KB
      (keepalive/sendBeacon reject >64 KiB); oversized batches split in half
      back onto the queue, a single never-sendable poison event is dropped.
- [in progress] VOICEOVER-AUDIT P0 #1 global app-voice toggle: sub-agent
      adding appVoice to profile, gating speak()/coach() in src/lib/speech.ts,
      Settings toggle. If not committed, check git status for its edits.

## 2026-06-12 (third session — unify + a11y polish, 1-hour sprint)

Goal: merge find-by-name and menu-from-link into ONE place; fix the speaking
page (overlapping bubbles, VoiceOver); fix the heading rotor so Description /
Ingredients / price stop hijacking dish-to-dish navigation; polish + ship.

- [x] UNIFIED FIND: FindScreen now takes a restaurant name OR a website link in a
      single box. looksLikeUrl() routes: explicit scheme or single dotted token
      -> parseMenuFromUrl; anything with a space (a name) -> findMenuByName.
      One in-flight guard, per-mode error copy. UrlScreen + 'url' route are now
      dead (kept for back-compat, unreferenced).
- [x] HOME: collapsed "Find a Restaurant" + "Menu from a Website Link" into one
      "Find a Menu" button. Saved restaurants kept.
- [x] HEADING ROTOR FIX (the big a11y ask): each dish is now a SINGLE h3 stop.
      dishLabel() folds name + price + description + ingredients into the h3
      aria-label; the visible price/description/ingredients are aria-hidden, so
      they are no longer h4 headings and no longer pollute the rotor. "Ingredients"
      is now an inline aria-hidden label, not a heading. Price reads as part of the
      dish, never its own stop.
- [x] BROWSE GUIDANCE: first switch into browse mode speaks how to use the rotor
      (open rotor, choose Headings, swipe up/down — one stop per dish).
- [x] SPEAKING PAGE: conversation transcript is now a bounded .convo-area region;
      bubbles are full-width, bordered, vertical-stacked with gaps (no overlap,
      assistant bubble accent-bordered, AAA surfaces). Empty-state placeholder.
- [x] No em-dashes in any new copy. npm run build green.

### Continued same sprint — backlog burn-down (REVIEW.md + VOICEOVER-AUDIT)
- [x] REVIEW.md #5/#12 events.ts: dropped permissive CORS for a same-origin
      guard; every string field clamped, content/metadata JSON capped; client_ts
      and duration_ms coerced; Promise.allSettled so one bad row no longer drops
      the batch; row cap 100 to 50.
- [x] REVIEW.md #7 timeout budget: find-menu search capped at 35s, stage-2 fetch
      gated on >15s remaining of a 55s budget; menu-from-url #14 dead conditional
      removed. Users now hear the honest "menu not online" message, not a 504.
- [x] REVIEW.md #9/#10/#11 scanner: no manual fallback mid-progress; heartbeat
      nag gated to stage-1 only at 3x interval; stop() releases video/cb/prev.
- [x] VOICEOVER-AUDIT P1-2 (Home h1), P1-5 (Saved: status region + two-tap
      delete confirm + focus return), P1-6 (Settings: allergy save announced in
      DOM + aloud), P1-7 (Find submit reachable when empty), P2-3 (drop dup
      phase aria-label).
- [x] Removed dead UrlScreen + 'url' route (truly one place to find a menu).

### Shipped this sprint (commits on main, all build-green + pushed)
2c69fe7 unify find + a11y heading rotor · fb53962 events hardening + Find VO
4c52845 find-menu budget · 7d8de5a scanner reliability · 20ec463 VoiceOver P1s
5bac3fd UrlScreen removal

### STILL OPEN (next session)
- REVIEW.md minors: #8 (PDF Content-Length pre-check / streamed cap), #13
  (Browserless token in query string -> header), #16 (telemetry multi-tab /
  pre-init queue race).
- Camera feature asks (FIXES-NEEDED): pinch/buttons ZOOM, LANDSCAPE capture,
  preview-vs-actual range match. (Capture sound + immediate audio already done;
  earconCapture fires on auto-capture.)
- VOICEOVER-AUDIT remaining: P1-3 (Onboarding focus on step change), P1-4
  (mic-transcription feedback in DOM on Login/Onboarding/Settings), P1-8/P2-* polish.
- [x] Allergy spellcheck (FIXES-NEEDED MEDIUM): DONE. util.ts correctAllergen /
      normalizeAllergens (curated allergen list + aliases + edit-distance, local
      and offline) wired into Settings save (announces corrections) and
      Onboarding finish. Verified: peanutts->peanuts, glooten->gluten,
      shellfsh->shellfish, chicken/tomato left untouched.
- SMOKE-RESULTS.md chain-restaurant 404s: renew BROWSERLESS_TOKEN, re-run
  scripts/smoke-restaurants.mjs against the new deploy.

LEFT OFF (2026-06-12 second session): three REVIEW.md Tier-1 fixes committed
(f0f725d) and build green. Sub-agent was finishing the app-voice toggle at the
4:41 PM hard stop — verify speech.ts/SettingsScreen.tsx edits, run npm run
build, commit, push. Then: REVIEW.md remaining majors (LLM category validation
in find-menu.ts, iOS coach utterance drop in speech.ts), SMOKE-RESULTS.md
chain-restaurant 404s (check BROWSERLESS_TOKEN), VOICEOVER-AUDIT P1s, push to
deploy.

---

# Restaurant Search Reliability & Transparency — feature/restaurant-search-reliability

Working branch: `feature/restaurant-search-reliability` (off `main`).
Do NOT commit to main; do NOT open a PR into main (per operational brief).

Goal: every retrieved menu tells the user which LOCATION was found, whether the
source is OFFICIAL or third-party, whether it is CURRENT, whether it is
COMPLETE, whether ingredient info is CONFIRMED or INFERRED, what MenuVoice is
DOING while it searches, and what to DO on failure.

Centerpiece target sentence:
> "I found the official menu for the Cheesecake Factory at Garden State Plaza in
> Paramus, New Jersey. I verified this location from the restaurant's website.
> This menu was checked today, appears to be location-specific, and may be
> incomplete because I could not find the drinks section."

## Baseline at session start (2026-06-27)
- Build (`tsc -b && vite build`) passes.
- Search: FindScreen -> /api/find-menu (one web_search -> candidate URLs ->
  fetch/score -> ONE extraction). Direct URLs -> /api/menu-from-url. Returns only
  `{ menu, restaurantName, address?, sourceUrl? }`. No provenance model.
- Loading copy = 3 vague rotating phrases; no cancel. Saved restaurants dedupe by
  NAME ONLY (chain branches collide). Allergens not classified explicit/inferred.

## Priority order (from brief)
1 loading states · 2 location matching · 3 source/freshness/completeness/confidence
· 4 static retrieval · 5 JS browser fallback · 6 allergen confidence ·
7 feedback · 8 caching/refresh · 9 voice controls.
Implementing 3 (data backbone) + 2 (storage/per-location) + 1 first.

## Status log — Session 1 (2026-06-27)
- [x] Read codebase; baseline build green.
- [x] Branch created.
- [x] **Provenance data model + server classification.** `MenuProvenance` type
      (sourceType, official, locationScope, confirmedLocation, sourceUrl,
      checkedAt, completeness, warnings). Server `classifySource` (official_site
      / official_pdf / official_ordering / third_party / direct_link / photo /
      unknown) and `classifyLocationScope` (specific/generic/unknown, evidence
      based). `find-menu` and `menu-from-url` return provenance.
- [x] **Feature 3 (source/freshness/completeness/confidence).** `incompleteReason`
      added to the parse so partial menus say WHY ("the drinks section is
      missing"). `src/lib/provenance.ts` turns provenance into honest speech:
      `provenanceSummary`, `provenanceOpeningNote`, `freshnessOf`/`checkedPhrase`
      (recent/aging/outdated), location/completeness answers. Conversation
      opening line now uses the provenance note.
- [x] **Feature 2 (location matching — first slice).** FindScreen confirm card
      shows the branch address + source evidence (official vs third-party,
      location-specific vs generic, may-be-incomplete) and the user confirms
      before opening. Storage de-dups by NAME + LOCATION, so chain branches save
      SEPARATELY (Paramus / Freehold / Hackensack no longer overwrite). Saved
      screen shows the branch location and passes provenance on reopen. Direct
      URL and PDF/photo flows still work and now carry provenance too.
- [x] **Feature 1 (loading + errors).** FindScreen narrates the real ordered
      pipeline stages (no fake %), offers "What are you doing?" (repeat current
      step), a Cancel that aborts the request (AbortController on the API calls),
      specific failure messages with next actions (Try again / Scan physical
      menu / paste a direct link), and moves focus to the confirm action or the
      failure explanation.
- [x] **Feature 6 (allergen confidence — messaging).** Allergen findings carry
      `explicit` vs `inferred` confidence. `allergenDisclaimer` and dish labels
      say "The restaurant lists X" only for declared allergens, else "may
      contain X based on the description, but the restaurant does not confirm
      it." Hidden-dish notices reworded to "may contain". System prompt hard
      rule: never present inferred ingredients as confirmed; say "could not find
      official allergen information" when unknown; never call a dish safe for a
      listed allergy without explicit confirmation.
- [x] **Feature 9 (voice controls — first slice).** Conversation answers, from
      metadata (not the LLM): "where did this menu come from / is this official",
      "is this the correct location", "when was this menu checked / how current",
      "is this menu complete". Existing Repeat / Pause / Resume / Done preserved.
- [x] **Tests.** `npm test` (node:test + tsx), 20 passing: source +
      location-scope classification, provenance speech, allergen confidence.
- [x] Build (`tsc -b && vite build`) and `npm test` both green. Preserved camera
      scan, direct URL/PDF/image, saved restaurants, voice conversation,
      preferences/allergy profile, server-side keys.

## NOT yet done (next sessions, priority order)
- **Feature 2 full multi-candidate selection.** Today the FIND stage still
  returns ONE best match (then user confirms). To present up to ~3 numbered
  candidate LOCATIONS with address/phone/evidence and let the user pick the
  branch BEFORE we read the menu, change the `find-menu` search prompt to return
  a `locations[]` array (name, address, phone, url, confidence, evidence), have
  FindScreen render a numbered accessible list, then call a second read step
  keyed to the chosen branch (append the chosen address to the query). Keep the
  current single-match path as the fallback when only one location is found.
- **Feature 1 true streamed stages.** The stage narration is client-side and
  timer-driven (honest about what it is *attempting*, but not event-driven). For
  exact step reporting, stream real stage events from `find-menu` via SSE /
  chunked response and drive the aria-live status from them.
- **Feature 4 retrieval depth.** Use JSON-LD / Schema.org `Menu`/`Restaurant`
  structured data in `_menuCore` before price heuristics; widen menu-link text
  (Drinks, Brunch, Order Online, location-specific menu pages); prefer links
  whose address/city matches the confirmed branch.
- **Feature 6 official allergen sources.** On allergy questions, fetch official
  allergen guides / nutrition / dietary PDFs and prefer them over menu
  descriptions. Add must-avoid / avoid-when-possible / preference-only tiers to
  the profile and enforce them.
- **Feature 7 correction/feedback flow.** "This menu is wrong" -> reason
  (wrong location / wrong menu / missing item / wrong price / outdated /
  allergy-info problem / other) + short note; downweight repeatedly-reported
  sources over time. New `/api/feedback` route + events table.
- **Feature 8 caching / refresh / change detection.** Reuse recent verified
  links, "Refresh this menu", compare to stored menu and summarize meaningful
  changes; never replace a strong source with a weaker one on a failed refresh.
- **Feature 5 rendered-browser fallback** (puppeteer is already a dep) — LAST,
  only when simpler methods fail; strict public-only, no login/checkout/CAPTCHA.
- **Feature 9 remaining controls.** Slow down / speak less / speak more detail,
  explicit "Refresh this menu" voice command (needs Feature 8).

## Manual VoiceOver test scenarios (to run on a real device)
1. Find by name + city: confirm the spoken stage updates are informative and not
   spammy; "What are you doing?" repeats the current step; Cancel stops cleanly
   and focus is reachable.
2. Confirm card: VoiceOver reads name, address, and the source-evidence line;
   "Open this menu" receives focus; "Not this one" returns to search.
3. Chain branches: save Cheesecake Factory in two different cities; both appear
   as separate entries in Saved with their locations announced.
4. Conversation voice controls: ask "where did this menu come from", "is this
   the right location", "when was this menu checked", "is this menu complete" —
   each answered from metadata without inventing menu facts.
5. Allergen wording: a dish with an inferred allergen is spoken as "may contain
   ... not confirmed"; a "Contains ..." dish is spoken as "the restaurant lists".
6. Failure path: search a place with no online menu; verify the specific message
   and that Try again / Scan physical menu are reachable via the rotor.
7. Regression: camera scan, direct URL, direct PDF, saved-menu reopen, and the
   pause/resume voice flow all still work end to end.

## LEFT OFF
Session 1 complete and pushed. Priorities 1, 3, and the storage/confirmation
slices of 2, plus the messaging slice of 6 and first voice controls of 9, are
implemented with tests; build + tests green. Next highest-value work is
**Feature 2 full multi-candidate location selection** (return `locations[]` from
find-menu and add the numbered picker), then **Feature 4 structured-data
retrieval**. See "NOT yet done" above for the full ordered plan.
