// Bug #11: order specification must stay optional and natural. Meet My Menu AI
// must never force a guest to confirm what they ordered before leaving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSystemPrompt } from '../src/lib/openai.ts';
import { EMPTY_PROFILE } from '../src/types.ts';
import type { ParsedMenu } from '../src/types.ts';

const MENU: ParsedMenu = {
  categories: [{ name: 'Mains', items: [{ name: 'Salmon', price: '$18' }] }],
};

test('the system prompt never instructs Meet My Menu AI to proactively ask what the guest decided', () => {
  const prompt = buildSystemPrompt(MENU, EMPTY_PROFILE);
  // The old, removed instruction that forced a question near the end of every
  // conversation. Must not reappear.
  assert.ok(!/ask ONCE what they have decided/i.test(prompt), 'must not instruct a forced order question');
  assert.match(prompt, /Do NOT ask what the guest has decided to order/);
});

test('the system prompt tells Meet My Menu AI to briefly confirm only when the guest brings it up', () => {
  const prompt = buildSystemPrompt(MENU, EMPTY_PROFILE);
  assert.match(prompt, /briefly and warmly confirm/i);
  assert.match(prompt, /Got it, I'll remember the salmon/);
});

test('the system prompt explicitly says not to nudge a browsing guest toward a decision', () => {
  const prompt = buildSystemPrompt(MENU, EMPTY_PROFILE);
  assert.match(prompt, /never nudge them toward picking something/i);
});

test('the system prompt still uses past orders for natural recommendations', () => {
  const withHistory = { ...EMPTY_PROFILE, pastOrders: ['the salmon'] };
  const prompt = buildSystemPrompt(MENU, withHistory);
  assert.match(prompt, /the salmon/);
  assert.match(prompt, /Don't force it/);
});

// extractSessionLearnings makes a live network call, so it isn't unit-tested
// directly here; instead this locks in the tightened prompt wording that
// distinguishes a decided order from mere discussion, so a regression is
// caught even though the call itself can't run in this suite.
test('the order-extraction prompt requires a clear decision, not mere discussion', () => {
  const source = readFileSync(join(import.meta.dirname, '..', 'src', 'lib', 'openai.ts'), 'utf8');
  assert.match(source, /ONLY dishes the guest clearly decided on or committed to ordering/);
  assert.match(source, /does NOT count as an ' \+\s*\n?\s*'order unless the guest then confirmed/s);
  assert.match(source, /orders MUST be an empty array/);
});

// The Demo Menu is for practice, never a real dining decision — bug #11
// requires it never gets learned from. finish() in ConversationScreen makes
// a network call and writes to the profile, so this is a source-level guard
// (same pattern as the speech-scope guard) rather than a live invocation.
test('Conversation never extracts or saves learnings from the Demo Menu', () => {
  const source = readFileSync(
    join(import.meta.dirname, '..', 'src', 'screens', 'ConversationScreen.tsx'),
    'utf8',
  );
  assert.match(source, /import \{ DEMO_RESTAURANT_NAME \} from '\.\.\/lib\/demoMenu'/);
  assert.match(source, /const isDemo = restaurantName === DEMO_RESTAURANT_NAME/);
  assert.match(source, /hasUser && hasApiKey\(\) && !isDemo/);
});
