# Meet My Menu rebrand report

Date: 2026-07-21

## Completed

- Renamed visible product copy from **MenuVoice** to **Meet My Menu** across the
  app, spoken guidance, VoiceOver labels, conversation transcript, tutorial,
  onboarding, settings, login, and AI assistant prompt.
- Renamed browser and PWA metadata, package names, app icon text, marketing SEO
  metadata, structured data, and all three maintained marketing-site copies.
- Renamed analytics pages, dashboards, reports, provider alerts, logs, test
  descriptions, and accessibility tooling.
- Updated report/smoke-test defaults and HTTP user-agent references to
  `meetmymenu.com`.
- Left Google sign-in implementation and configuration unchanged.

## Verification completed

- `npm test`: 77 tests passed.
- `npm run build`: TypeScript, API type-checking, Vite, and PWA build passed.
- Accessibility audit: login, onboarding, home, menu chooser, capture, find,
  saved restaurants, and settings all completed with zero reported violations.
- Visually checked the menu chooser, capture, and find-menu audit screenshots.
- `git diff --check`: passed.

## Compatibility names intentionally retained

The following are internal data namespaces rather than visible branding.
Renaming them without a migration would hide existing user and reporting data:

- `menuvoice.profile.v1`, `menuvoice.savedRestaurants.v1`, and
  `menuvoice-navigation`.
- `menuvoice_accessibility_preferences`, `menuvoice_site_session_id`, and
  `menuvoice_site_visit_day`.
- `menuvoice:waitlist`, `menuvoice:waitlist:log`,
  `menuvoice:site:events`, `menuvoice:cartesia:key-rotation:v1`, and
  `menuvoice:alerts:cartesia-credits`.

Tests continue to use these exact legacy keys so they exercise existing-user
state. A future namespace change should use dual-read/dual-write migration code.

## Remaining external work

1. Decide whether `meetmymenu.com` hosts the app or marketing site and assign
   any app subdomain accordingly.
2. Configure the chosen Vercel domains, DNS, TLS, `www`, and redirects from
   the old app and marketing domains.
3. Update the shared Apple Shortcut name/destination and
   `VITE_APPLE_SHORTCUT_URL`.
4. Verify the new domain with the email provider and configure
   `RESEND_FROM`.
5. Update the Gmail reporting filter, analytics properties, Search Console,
   external profiles, outreach templates, and links outside this repository.
6. Verify one existing-PWA upgrade and one fresh iPhone installation with
   VoiceOver.
7. Complete and verify Google OAuth origins separately.

## Historical names

The repository name `menuvoice2`, deployment folder `menuvoice-site`,
testing-skill identifier, legacy data keys, and historical planning/audit
documents still contain the old name. They were not bulk-renamed because they
are either operational identifiers or historical records.
