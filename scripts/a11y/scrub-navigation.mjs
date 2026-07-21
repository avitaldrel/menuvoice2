/**
 * Smoke test for the browser primitive used by VoiceOver's two-finger scrub.
 * Run against `npm run preview -- --port 4173`.
 */

import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';
import { resolveA11yBaseUrl, testProfileJson } from './test-config.mjs';

const PROFILE = testProfileJson({ email: 'scrub-test@meetmymenu.com', name: 'Scrub Test' });
const BASE_URL = resolveA11yBaseUrl();

async function verifyBackNavigation(browserType, browserName) {
  const browser = await browserType.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.addInitScript((profile) => {
      localStorage.setItem('menuvoice.profile.v1', profile);
      // Keep capture startup pending so the arrival assertions are not changed
      // by a headless browser's missing-camera recovery message.
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => new Promise(() => {}) },
      });
    }, PROFILE);

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Settings' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.evaluate((element) => element.open), true);
    assert.equal(await page.evaluate(() => history.state?.position), 1);
    assert.equal(
      await page.getByRole('main').evaluate((element) => element === document.activeElement),
      true,
    );

    // Build a two-entry stack so dismissing a nested route proves that Back
    // restores the preceding non-home dialog instead of skipping to Home.
    await page.getByRole('button', { name: 'How Meet My Menu AI works' }).click();
    const tutorialHeading = page.getByRole('heading', { name: 'How Meet My Menu AI works', level: 1 });
    await tutorialHeading.waitFor();
    assert.equal(await page.evaluate(() => history.state?.position), 2);
    assert.equal(await page.getByRole('main').evaluate((element) => element === document.activeElement), true);

    // Keyboard Escape and the iOS VoiceOver scrub both use the dialog's native
    // dismiss/cancel path. Each dismissal must restore exactly one history entry.
    // Repeated accessibility dismissals can arrive before popstate completes.
    // They must collapse into one Back traversal instead of skipping a route.
    await dialog.evaluate((element) => {
      element.dispatchEvent(new Event('cancel', { cancelable: true }));
      element.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    await page.getByRole('button', { name: 'How Meet My Menu AI works' }).waitFor();
    assert.equal(await page.evaluate(() => history.state?.position), 1);
    assert.equal(await dialog.evaluate((element) => element.open), true);
    assert.equal(
      await page.getByRole('main').evaluate((element) => element === document.activeElement),
      true,
    );

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

    // Capture arrival must not queue the previous Home instructions, every
    // camera control, or a second explanatory paragraph. The focused landmark
    // gives VoiceOver one action and then waits for live camera coaching.
    await page.getByRole('button', { name: 'Read a Menu' }).click();
    await page.getByRole('button', { name: 'Scan a Menu' }).click();
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.getAttribute('aria-label'), 'Capture menu');
    const captureMain = page.getByRole('main', { name: 'Hold your phone flat over the menu.' });
    await captureMain.waitFor();
    assert.equal(await captureMain.evaluate((element) => element === document.activeElement), true);
    assert.deepEqual(
      (await page.getByRole('status').allTextContents()).filter((text) => text.trim()),
      [],
    );

    console.log(`VoiceOver scrub navigation smoke test passed in ${browserName}.`);
  } finally {
    await browser.close();
  }
}

await verifyBackNavigation(chromium, 'Chromium');
await verifyBackNavigation(webkit, 'WebKit');
