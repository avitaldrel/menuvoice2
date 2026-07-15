/**
 * Smoke test for the browser primitive used by VoiceOver's two-finger scrub.
 * Run against `npm run preview -- --port 4173`.
 */

import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const PROFILE = JSON.stringify({
  email: 'scrub-test@menuvoice.app',
  name: 'Scrub Test',
  allergies: [],
  dislikes: [],
  spiceTolerance: 'medium',
  cuisinesLiked: [],
  pastOrders: [],
  hidePrices: false,
  ttsVoice: 'shimmer',
  onboarded: true,
});
const BASE_URL = process.argv[2] ?? process.env.A11Y_BASE_URL ?? 'http://localhost:4173';

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.addInitScript((profile) => {
    localStorage.setItem('menuvoice.profile.v1', profile);
  }, PROFILE);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Settings' }).click();

  const dialog = page.locator('dialog.app-route-dialog');
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await dialog.evaluate((element) => element.open), true);
  assert.equal(await page.evaluate(() => history.state?.position), 1);

  // Keyboard Escape and the iOS VoiceOver scrub both use the dialog's native
  // dismiss/cancel path. The handler must restore the previous history entry.
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => history.state?.position), 0);
  await page.getByRole('button', { name: 'Settings' }).waitFor();

  // Some WebKit versions may close directly for an accessibility dismiss.
  // Verify the close-event fallback performs the same navigation.
  await page.getByRole('button', { name: 'Settings' }).click();
  await dialog.waitFor({ state: 'visible' });
  await dialog.evaluate((element) => element.close());
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => history.state?.position), 0);

  console.log('VoiceOver scrub navigation smoke test passed.');
} finally {
  await browser.close();
}
