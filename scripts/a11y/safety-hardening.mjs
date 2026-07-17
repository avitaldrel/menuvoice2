/**
 * Browser regression for PR #20's first-run tutorial, allergy review, and
 * full-viewport dialog scrolling. Run against `npm run preview -- --port 4173`.
 */

import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { resolveA11yBaseUrl, testProfileJson } from './test-config.mjs';

const BASE_URL = resolveA11yBaseUrl();
const PROFILE_KEY = 'menuvoice.profile.v1';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
const page = await context.newPage();

try {
  await page.addInitScript(
    ({ key, profile }) => localStorage.setItem(key, profile),
    {
      key: PROFILE_KEY,
      profile: testProfileJson({
        email: 'safety-test@menuvoice.app',
        name: '',
        onboarded: false,
        tutorialSeen: false,
        theme: undefined,
        textScale: undefined,
      }),
    },
  );

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.textScale), 'large');

  await page.getByLabel('What should I call you? Type your answer here').fill('Safety Test');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Any food allergies? Type your answer here').fill('shellfsh, blorf');
  await page.getByRole('button', { name: 'Finish' }).click();

  const firstQuestion = page.getByText(/Question 1 of 2.*shellfsh.*shellfish/);
  await firstQuestion.waitFor();
  const reviewHeading = page.getByRole('heading', { name: 'Checking your allergies', level: 2 });
  assert.equal(await reviewHeading.evaluate((element) => element === document.activeElement), true);
  await page.getByRole('button', { name: 'Yes, save shellfish' }).click();

  const secondQuestion = page.getByText(/Question 2 of 2.*blorf/);
  await secondQuestion.waitFor();
  assert.equal(await secondQuestion.evaluate((element) => element === document.activeElement), true);
  await page.getByRole('button', { name: 'Remove blorf from my allergy list' }).click();

  await page.getByRole('heading', { name: 'Welcome to MenuVoice', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Settings' }).waitFor();

  const firstRunProfile = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROFILE_KEY);
  assert.deepEqual(firstRunProfile.allergies, ['shellfish']);
  assert.equal(firstRunProfile.tutorialSeen, true);

  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await dialog.evaluate((element) => element.scrollHeight > element.clientHeight), true);

  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.mouse.move(900, 300);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(100);
  assert.equal(await dialog.evaluate((element) => element.scrollTop > 0), true);

  const allergyInput = page.getByLabel('Allergies, comma separated');
  await allergyInput.scrollIntoViewIfNeeded();
  await allergyInput.fill('glutin, gluten');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'No, keep glutin exactly as I entered it' }).click();
  await page.getByText('Saved. I will warn you about gluten, glutin.').waitFor();

  const settingsProfile = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), PROFILE_KEY);
  assert.deepEqual(settingsProfile.allergies, ['gluten', 'glutin']);

  console.log('Safety hardening browser smoke test passed.');
} finally {
  await context.close();
  await browser.close();
}
