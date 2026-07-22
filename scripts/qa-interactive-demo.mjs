import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
console.log('browser launched');
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.goto('http://127.0.0.1:4179/', { waitUntil: 'domcontentloaded', timeout: 8_000 });
  console.log('page loaded');

  await page.locator('[data-demo-question="ingredients"]').click();
  console.log('first question clicked');
  await page.locator('#interactive-demo-status').filter({ hasText: 'Answer ready' }).waitFor({ timeout: 10_000 });
  let turns = await page.locator('.demo-turn').count();
  if (turns !== 2) throw new Error('Expected 2 turns after first question, got ' + turns);

  await page.locator('[data-demo-question="shellfish"]').click();
  console.log('second question clicked');
  await page.locator('#interactive-demo-status').filter({ hasText: 'Answer ready' }).waitFor({ timeout: 10_000 });
  turns = await page.locator('.demo-turn').count();
  if (turns !== 4) throw new Error('Expected 4 chained turns, got ' + turns);

  const answer = await page.locator('.demo-turn-assistant').last().innerText();
  if (!answer.includes('confirm with restaurant staff')) {
    throw new Error('Allergen confirmation wording is missing');
  }

  await page.locator('#demo-section').screenshot({
    path: 'C:/Users/2fire/AppData/Local/Temp/meet-my-menu-interactive-demo.png',
  });

  await page.locator('#interactive-demo-reset').click();
  turns = await page.locator('.demo-turn').count();
  if (turns !== 0) throw new Error('Reset did not clear the conversation');

  console.log('Interactive demo passed: chained questions, allergen wording, screenshot, reset.');
} finally {
  await browser.close();
}
