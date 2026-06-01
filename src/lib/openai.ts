// All OpenAI calls. Plain fetch from the browser.
//
// SECURITY: ships the key to the client. Fine for a private demo. For a pilot,
// move these functions behind a serverless proxy and call that. See README.

import { ParsedMenu, UserProfile, ChatTurn } from '../types';

const API = 'https://api.openai.com/v1';

const KEY = import.meta.env.VITE_OPENAI_API_KEY ?? '';
const VISION_MODEL = import.meta.env.VITE_VISION_MODEL ?? 'gpt-4o-mini';
const CHAT_MODEL = import.meta.env.VITE_CHAT_MODEL ?? 'gpt-4o-mini';
const TTS_MODEL = import.meta.env.VITE_TTS_MODEL ?? 'tts-1-hd';
const TTS_VOICE_DEFAULT = import.meta.env.VITE_TTS_VOICE ?? 'shimmer';

export function hasApiKey(): boolean {
  return KEY.startsWith('sk-') && KEY.length > 20;
}

function authHeaders(extra?: Record<string, string>) {
  return { Authorization: `Bearer ${KEY}`, ...extra };
}

/** Menu photos (base64 JPEG, no data: prefix) -> structured menu. */
export async function parseMenuFromImages(imagesBase64: string[]): Promise<ParsedMenu> {
  const content: any[] = [
    {
      type: 'text',
      text:
        'You are reading photos of one restaurant menu (possibly multiple pages/photos of the SAME menu). ' +
        'Extract EVERY item you can see. Group items into the menu’s natural sections ' +
        '(appetizers, mains, desserts, drinks, specials, etc.). ' +
        'For each item include: name, description (if shown), price (as written, with currency symbol), ' +
        'and a best-effort ingredients list inferred from the name and description. ' +
        'If a photo is unreadable, note it. Respond ONLY with JSON matching this shape: ' +
        '{"categories":[{"name":string,"items":[{"name":string,"description":string,"price":string,"ingredients":string[]}]}],"notes":string}',
    },
  ];
  for (const b64 of imagesBase64) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'high' } });
  }

  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`Menu analysis failed (${res.status}): ${await safeText(res)}`);

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content ?? '{}';
  let parsed: ParsedMenu;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The menu reader returned something I could not understand. Try retaking the photos.');
  }
  if (!parsed.categories || parsed.categories.length === 0) {
    throw new Error('I could not find any menu items in those photos. Try again with more light.');
  }
  return parsed;
}

/** Recorded audio Blob -> transcript (Whisper). */
export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : 'm4a';
  form.append('file', blob, `speech.${ext}`);
  form.append('model', 'whisper-1');
  form.append('language', 'en');

  const res = await fetch(`${API}/audio/transcriptions`, {
    method: 'POST',
    headers: authHeaders(), // let the browser set multipart boundary
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await safeText(res)}`);
  const json = await res.json();
  return (json.text ?? '').trim();
}

function buildSystemPrompt(menu: ParsedMenu, profile: UserProfile): string {
  const allergies = profile.allergies.length ? profile.allergies.join(', ') : 'none on file';
  const dislikes = profile.dislikes.length ? profile.dislikes.join(', ') : 'none on file';
  const cuisines = profile.cuisinesLiked.length ? profile.cuisinesLiked.join(', ') : 'no strong preferences on file';
  const orders = profile.pastOrders.length ? profile.pastOrders.join(', ') : 'none yet';

  return [
    `You are MenuVoice, a warm, calm voice assistant helping ${profile.name || 'a guest'} who is blind or low-vision navigate a restaurant menu by voice.`,
    '',
    'HARD RULES:',
    `- The guest has these ALLERGIES: ${allergies}. Before describing, recommending, or discussing ANY item that contains (or likely contains) one of these allergens, you MUST flag it first, e.g. "Heads up — this contains shellfish, which is one of your allergies. Want me to continue?"`,
    `- The guest dislikes: ${dislikes}. Spice tolerance: ${profile.spiceTolerance}. Cuisines they like: ${cuisines}.`,
    `- Dishes ${profile.name || 'the guest'} has chosen/enjoyed before: ${orders}. When it fits naturally, use these to make recommendations (e.g. "last time you went for the ${profile.pastOrders[0] ?? 'salmon'}, so you might like…"). Don't force it.`,
    profile.hidePrices
      ? '- The guest has hidden prices. Do NOT say prices unless they explicitly ask.'
      : '- Say prices when relevant.',
    '- Keep answers short and conversational — this is spoken aloud. 1–3 sentences unless they ask for detail. No markdown, no bullet symbols, no emoji.',
    '- Never invent items that are not on the menu. If unsure, say so.',
    '- End most turns with a brief, natural question that keeps the conversation moving.',
    '',
    'REMEMBERING THEIR CHOICE:',
    '- Near the END of the conversation, once the guest seems to be settling on what to get, ask ONCE what they have decided to order. When they tell you, acknowledge it warmly and let them know you will remember it for next time so you can suggest things they like.',
    '- Ask this only once, and only when they seem ready to decide. Never nag, never interrupt the middle of the conversation to ask, and never repeat the question if they already told you.',
    '',
    'THE MENU (structured JSON):',
    JSON.stringify(menu),
  ].join('\n');
}

export function buildOpeningLine(menu: ParsedMenu): string {
  const names = menu.categories.map((c) => c.name);
  if (names.length === 0) return 'I have your menu, but I could not find any sections. Want to retake the photos?';
  const list =
    names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  const word = names.length === 1 ? 'section' : 'sections';
  return `I found ${names.length} ${word} on this menu: ${list}. Where would you like to start?`;
}

export async function chatReply(
  menu: ParsedMenu,
  profile: UserProfile,
  history: ChatTurn[],
  userText: string
): Promise<string> {
  const messages: any[] = [{ role: 'system', content: buildSystemPrompt(menu, profile) }];
  for (const t of history) messages.push({ role: t.role, content: t.text });
  messages.push({ role: 'user', content: userText });

  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ model: CHAT_MODEL, messages, temperature: 0.5, max_tokens: 220 }),
  });
  if (!res.ok) throw new Error(`Reply failed (${res.status}): ${await safeText(res)}`);
  const json = await res.json();
  return (json.choices?.[0]?.message?.content ?? 'Sorry, I missed that. Could you say it again?').trim();
}

export interface SessionLearnings {
  orders: string[]; // dishes the guest decided to get
  likes: string[]; // foods/cuisines/ingredients they reacted well to
  dislikes: string[]; // things they reacted against
}

/**
 * After a conversation, pull out what the guest decided and what they revealed
 * about their taste, so the profile can recommend better next time. Cheap, runs
 * once on the way out. Returns empty arrays if nothing clear.
 */
export async function extractSessionLearnings(turns: ChatTurn[]): Promise<SessionLearnings> {
  const empty: SessionLearnings = { orders: [], likes: [], dislikes: [] };
  const transcript = turns
    .map((t) => `${t.role === 'assistant' ? 'MenuVoice' : 'Guest'}: ${t.text}`)
    .join('\n');
  if (!transcript.trim()) return empty;

  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'From this restaurant menu conversation, extract what the GUEST decided. ' +
            'Respond ONLY with JSON: {"orders":string[],"likes":string[],"dislikes":string[]}. ' +
            'orders = specific dishes the guest said they will order or have decided on (exact dish names). ' +
            'likes = foods, cuisines, or ingredients the guest reacted positively to. ' +
            'dislikes = ones they reacted against. Use empty arrays if unclear. Never invent.',
        },
        { role: 'user', content: transcript },
      ],
    }),
  });
  if (!res.ok) return empty;
  try {
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');
    return {
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      likes: Array.isArray(parsed.likes) ? parsed.likes : [],
      dislikes: Array.isArray(parsed.dislikes) ? parsed.dislikes : [],
    };
  } catch {
    return empty;
  }
}

/** Text -> mp3 Blob (OpenAI TTS). */
export async function synthesizeSpeech(text: string, voice?: string): Promise<Blob> {
  const res = await fetch(`${API}/audio/speech`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: voice || TTS_VOICE_DEFAULT,
      input: text,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(`Speech failed (${res.status}): ${await safeText(res)}`);
  return await res.blob();
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}
