// Live end-to-end proof for bug #11/#12: order specification stays optional
// and natural, and preference learning only fires on a genuine decision.
//
// Runs real scenarios against the live model (same prompts as src/lib/openai.ts)
// and checks the acceptance criteria from the bugs report:
//   - a clear decision ("I'll get the salmon") is saved as an order
//   - browsing / asking about allergens saves nothing
//   - an unconfirmed recommendation is NOT saved as a decided order
//   - explicit "remember that I chose X" phrasing is captured
//   - a later, unrelated restaurant references a past order naturally, not forcibly
//   - MenuVoice briefly confirms in-conversation when the guest decides
//
// Run: node scripts/verify-order-learning.mjs
//
// NOTE: the two prompts below are duplicated from src/lib/openai.ts
// (buildSystemPrompt's REMEMBERING THEIR CHOICE section and
// extractSessionLearnings' system prompt) because that module reads
// import.meta.env / uses relative fetch() paths that only resolve inside
// Vite's browser context. Keep this in sync by hand if those prompts change —
// same tradeoff already made in scripts/add-partner.mjs for normalizePartnerName.

import { readFileSync } from 'node:fs';

for (const file of ['../.env.local', '../.env']) {
  try {
    for (const line of readFileSync(new URL(file, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|(.*))$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2] ?? m[3] ?? '';
    }
  } catch {}
}

const key = process.env.TEST_OPENAI_KEY ?? process.env.OPENAI_API_KEY ?? process.env.VITE_OPENAI_API_KEY;
if (!key) {
  console.error('FAIL: no OpenAI key found in .env.local / .env');
  process.exit(1);
}

const MODEL = process.env.CHAT_MODEL ?? 'gpt-5.4-mini';

async function chatJson(messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
}

async function chatText(messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, max_completion_tokens: 220 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.choices?.[0]?.message?.content ?? '').trim();
}

const EXTRACTION_PROMPT =
  'From this restaurant menu conversation, extract what the GUEST decided. ' +
  'Respond ONLY with JSON: {"orders":string[],"likes":string[],"dislikes":string[]}. ' +
  'orders = ONLY dishes the guest clearly decided on or committed to ordering (e.g. "I\'ll get the salmon", ' +
  '"let\'s go with the pasta", "remember that I chose the carbonara") — exact dish names. ' +
  'Merely asking about a dish, comparing two dishes, or MenuVoice recommending one does NOT count as an ' +
  'order unless the guest then confirmed or agreed to it. If the guest was only browsing or asking ' +
  'questions and never settled on anything, orders MUST be an empty array. ' +
  'likes = foods, cuisines, or ingredients the guest reacted positively to. ' +
  'dislikes = ones they reacted against. Use empty arrays if unclear. Never invent.';

async function extract(turns) {
  const transcript = turns.map(([role, text]) => `${role === 'assistant' ? 'MenuVoice' : 'Guest'}: ${text}`).join('\n');
  return chatJson([
    { role: 'system', content: EXTRACTION_PROMPT },
    { role: 'user', content: transcript },
  ]);
}

const REMEMBER_INSTRUCTIONS = [
  'You are MenuVoice, a calm voice assistant helping a guest navigate a restaurant menu by voice.',
  '- Keep answers short and conversational, spoken aloud, 1-3 sentences.',
  'REMEMBERING THEIR CHOICE:',
  '- Do NOT ask what the guest has decided to order. Many guests are only browsing, comparing dishes, or checking allergens, and a forced question feels intrusive.',
  "- If the guest tells you naturally that they have decided — \"I'll get the salmon\", \"let's go with the pasta\", \"remember that I chose the carbonara\" — briefly and warmly confirm what you will remember, e.g. \"Got it, I'll remember the salmon for next time.\" Keep the confirmation to one short sentence.",
  '- If they never mention a decision, say nothing about it and never nudge them toward picking something before they leave.',
].join('\n');

function replyMessages(menuNote, pastOrders, history, userText) {
  const system = [
    REMEMBER_INSTRUCTIONS,
    `MENU: ${menuNote}`,
    pastOrders.length ? `Dishes the guest has chosen before: ${pastOrders.join(', ')}. Use naturally if relevant. Don't force it.` : '',
  ].join('\n');
  return [
    { role: 'system', content: system },
    ...history.map(([role, text]) => ({ role, content: text })),
    { role: 'user', content: userText },
  ];
}

let failures = 0;
function check(label, cond, detail) {
  if (cond) console.log(`PASS  ${label}`);
  else { failures++; console.log(`FAIL  ${label}\n      ${detail}`); }
}

console.log(`Model: ${MODEL}\n`);

const decided = await extract([
  ['assistant', 'Would you like to hear about the salmon or the pasta?'],
  ['user', 'Tell me about both.'],
  ['assistant', 'The salmon is grilled with lemon butter. The pasta is a carbonara with pancetta.'],
  ['user', "I'll get the salmon."],
]);
check('a clear decision is saved as an order', decided.orders?.some((o) => /salmon/i.test(o)), JSON.stringify(decided));

const browsing = await extract([
  ['user', "What's in the carbonara?"],
  ['assistant', 'Eggs, pancetta, and pecorino.'],
  ['user', 'Does the salmon have any allergens listed?'],
  ['assistant', 'No major allergens are listed for it.'],
  ['user', 'Just checking, thanks.'],
]);
check('browsing / checking allergens saves nothing', (browsing.orders?.length ?? 0) === 0, JSON.stringify(browsing));

const unconfirmed = await extract([
  ['user', 'What do you recommend?'],
  ['assistant', "I'd suggest the salmon, it's a popular choice."],
  ['user', "Maybe, I'll think about it."],
]);
check('an unconfirmed recommendation is not a decided order', (unconfirmed.orders?.length ?? 0) === 0, JSON.stringify(unconfirmed));

const explicit = await extract([['user', 'Remember that I chose the pasta.']]);
check('explicit "remember" phrasing is captured', explicit.orders?.some((o) => /pasta/i.test(o)), JSON.stringify(explicit));

const naturalUse = await chatText(replyMessages(
  'Thai restaurant: Pad Thai $14, Drunken Noodles $15, Green Curry $16.',
  ['the salmon'],
  [],
  'What do you recommend?',
));
check(
  'a later, unrelated restaurant does not force the old dish onto this menu',
  !/\bsalmon\b/i.test(naturalUse) || !/get the salmon|order the salmon/i.test(naturalUse),
  naturalUse,
);

const liveConfirm = await chatText(replyMessages(
  'Thai restaurant: Pad Thai $14, Drunken Noodles $15, Green Curry $16.',
  ['the salmon'],
  [
    ['assistant', 'We have pad thai, drunken noodles, and a green curry tonight.'],
    ['user', 'What is in the pad thai?'],
    ['assistant', 'Rice noodles, egg, tofu, bean sprouts, and peanuts in a tamarind sauce.'],
  ],
  "I'll get the pad thai.",
));
check(
  'MenuVoice briefly confirms an explicit in-conversation decision',
  /pad thai/i.test(liveConfirm) && liveConfirm.split(/[.!?]/).filter(Boolean).length <= 2,
  liveConfirm,
);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
