# Meet My Menu (mobile web prototype)

Production domain: [meetmymenu.com](https://meetmymenu.com)

**Meet My Menu is a voice-first menu navigation app for blind and low-vision
diners.** Capture a menu, then talk to it: ask what's on it, what's cheap, or
what fits your diet — with proactive allergen warnings from your saved profile
and strict turn-taking so the app never cuts you off.

You can [open Meet My Menu](https://meetmymenu.com/). To learn more about its
founder, Avital Drel, and see more
accessibility and product work, visit
[AvitalDrel.com](https://avitaldrel.com/).

This is a **mobile web app** (React + Vite). It runs on Windows/Mac for dev, and
deploys to a URL your testers open on their own iPhone with VoiceOver — no App
Store, no TestFlight.

---

## What works in this build

- First-use spoken onboarding (name, allergies, preferences), stored on device.
- Home → New Restaurant / Saved Restaurants.
- **Menu capture:** live camera preview with **auto-shutter + real-time audio
  coaching** (default on) — hold the phone steady over the menu and it fires
  itself, guiding by voice ("hold still", "a bit dark, more light", "capturing
  now"); plus a manual shutter and library upload. Multi-photo with spoken
  photo-count feedback; after an auto-shot it waits for a page turn before
  arming again so it won't double-shoot the same page.
- **AI menu analysis:** photos → GPT-4o mini vision → structured menu (sections,
  items, prices, inferred ingredients).
- **Core conversation:** app speaks first, announces the sections, then strict
  turn-taking voice chat. Record → Whisper (STT) → GPT-4o mini → OpenAI TTS,
  played back aloud. Falls back to the browser's built-in voice if TTS fails.
- **Proactive allergen flagging** from your stored allergies.
- **Saved restaurants** — captured menus persist (localStorage); reload without
  re-capturing.
- **Settings** — hide prices, edit allergies/preferences, choose TTS voice.

## What is NOT in this build (and why)

- **Document edge-detection / perspective crop.** Auto-shutter (see above) uses
  a lightweight brightness + content + steadiness heuristic
  (`src/lib/autocapture.ts`), not OpenCV document-corner detection. It fires when
  the phone is held still over readable content; it does not auto-crop/deskew the
  page. Good enough for the demo; OpenCV.js is the upgrade path if precise
  cropping is needed later. Thresholds at the top of `autocapture.ts` are tunable.
- **URL / restaurant-name menu lookup.** Stubbed for the prototype.
- **Cross-user shared menus (V2).** The storage model already supports it
  (`SavedRestaurant` has its own id + capturedAt), so no migration later.

---

## Run it (dev)

Needs **Node 18+**.

```bash
npm install

# add your OpenAI key
cp .env.example .env       # then edit .env, paste key into VITE_OPENAI_API_KEY

npm run dev                # opens http://localhost:5173
```

On your computer, `localhost` is a "secure context", so camera + microphone work.

### One OpenAI key

`VITE_OPENAI_API_KEY` covers vision + Whisper + chat + TTS. Get it at
https://platform.openai.com/api-keys. Optional overrides: `VITE_TTS_MODEL`
(default `tts-1-hd`), `VITE_TTS_VOICE` (default `shimmer`),
`VITE_VISION_MODEL` / `VITE_CHAT_MODEL` (default `gpt-4o-mini`).

> After editing `.env`, restart `npm run dev` so Vite picks up the new value.

## Test on an iPhone (for the NFB demo)

iOS Safari only allows camera/microphone over **HTTPS or localhost** — the LAN
`http://192.168.x.x` URL will NOT get camera access. So for on-phone testing,
deploy to a free HTTPS host:

```bash
npm run build            # outputs dist/
```

- **Vercel:** `npx vercel` (or connect the repo). Set `VITE_OPENAI_API_KEY` in
  the project's Environment Variables. Send the testers the URL.
- **Netlify:** `npx netlify deploy --prod` after `npm run build`, same env var.

Then on the iPhone: open the URL in Safari, allow camera + mic, turn on VoiceOver
(Settings → Accessibility → VoiceOver).

## Security (before any wider pilot)

This prototype calls OpenAI **directly from the browser** with the key in the
bundle — extractable. Fine for a private demo on your own phone. Before handing a
build to outside testers, move the four functions in `src/lib/openai.ts` behind a
serverless proxy (Vercel/Netlify function) and point the app at that. Nothing
else changes.

---

## Project map

```
index.html                 entry
src/main.tsx               React mount
src/App.tsx                stack navigation + onboarding gate
src/index.css              dark, WCAG AAA theme, large touch targets, focus rings
src/theme.ts               design tokens (also mirrored in index.css)
src/types.ts               data models
src/components.tsx         accessible Screen / Title / Button / TextField
src/nav.ts                 route model
src/util.ts                helpers
src/state/ProfileContext.tsx  profile load/save/update
src/lib/openai.ts          vision parse, Whisper STT, chat, TTS  (proxy target)
src/lib/speech.ts          TTS playback (OpenAI, falls back to browser voice)
src/lib/recorder.ts        mic record via MediaRecorder (tap-to-stop = never cut off)
src/lib/camera.ts          getUserMedia + frame capture (auto-capture seam)
src/lib/storage.ts         localStorage: profile + saved restaurants
src/screens/               Onboarding, Home, Capture, Conversation, Saved, Settings
```

The conversation state machine and the turn-taking guarantee are documented at
the top of `src/screens/ConversationScreen.tsx`.

## About the founder

Meet My Menu was created by Avital Drel. Visit
[AvitalDrel.com](https://avitaldrel.com/) to explore more accessibility and
product work.
