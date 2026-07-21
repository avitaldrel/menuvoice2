// POST { query: "restaurant name, city" } -> { menu, restaurantName, address?, sourceUrl? }
//
// Two clean stages, each doing the one job it is actually good at:
//   1. FIND. One OpenAI Responses API web_search call returns ONLY the restaurant
//      identity (name + address) and a ranked list of candidate menu URLs. It does
//      not copy the menu — web_search is good at locating pages, weak at deeply
//      reading JS-rendered chain menus, so we don't ask it to.
//   2. READ. We fetch the candidates ourselves with the shared pipeline (handles
//      HTML, PDF, images, and JS shells via the free Jina reader render path),
//      score them by how menu-like they look, and run the expensive extraction
//      ONCE on the richest page. Deterministic, and credit-cheap (usually 1 parse).
//
// If we genuinely cannot read any candidate, we say so honestly instead of
// claiming the menu "isn't online" (it usually is) or inventing items.
//
// TODO(chains): a known-chain shortlist (name -> best readable menu URL) would let
// big national chains skip the search call entirely. Tracked in FIXES-NEEDED.md.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  fetchMenuSource,
  parseMenuSource,
  menuItemCount,
  menuLikelihood,
  extractJson,
  classifySource,
  classifyLocationScope,
  FriendlyError,
  type MenuSource,
} from './_menuCore.js';

const SEARCH_MODEL = process.env.SEARCH_MODEL ?? 'gpt-5.4-mini';

const FIND_JSON_SHAPE =
  '{"found":boolean,"restaurantName":string|null,"address":string|null,"menuUrls":[string],"reason":string}';

// A candidate page scoring this high is clearly a full menu — stop probing others.
// menuLikelihood blends prices, food-word density, and length (see _menuCore).
const STRONG_MENU_SIGNAL = 25;

function buildPrompt(query: string): string {
  return [
    `Find the official, CURRENT menu page(s) for the restaurant "${query}" online.`,
    '',
    'Your ONLY job is to identify the right restaurant and return the BEST web',
    'addresses where its full menu can actually be read. Do NOT copy menu items',
    'into your answer.',
    '',
    'Rank "menuUrls" best-first. Strongly prefer, in this order:',
    '  1. The restaurant\'s OWN website menu page (a /menu page or a menu PDF).',
    '  2. Their official online-ordering page (Toast, Square, ChowNow, Clover, Olo).',
    '  3. A reputable listing showing the full menu (Yelp, DoorDash, Grubhub, Google).',
    'Give 1 to 4 candidate URLs. Each MUST be a real URL you actually saw in search',
    'results, never a guessed or constructed address.',
    '',
    'Confirm the restaurant matches the requested name AND location. Put its city or',
    'neighborhood (and street if you know it) in "address" so the user can verify it',
    'is the right place. Prefer the specific local branch when a city was given.',
    '',
    'If you cannot confidently identify the restaurant at all, set found=false and',
    'explain briefly in "reason".',
    '',
    `Respond ONLY with JSON matching: ${FIND_JSON_SHAPE}`,
  ].join('\n');
}

/** Keep only well-formed, deduped public-looking http(s) URLs, ranked as given. */
function sanitizeUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of raw) {
    if (typeof u !== 'string') continue;
    const url = u.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 4) break;
  }
  return out;
}

/** Concatenate output_text items from a Responses API result. */
function responseText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  let out = '';
  for (const item of data?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') out += part.text;
    }
  }
  return out;
}

async function searchForMenuUrls(query: string, timeoutMs: number): Promise<any> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new FriendlyError('No API key configured on the server.', 500);

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      tools: [{ type: 'web_search' }],
      input: buildPrompt(query),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[Meet My Menu] find-menu search error:', res.status, text.slice(0, 500));
    throw new FriendlyError('The restaurant search is having trouble right now. Please try again in a moment.', 502);
  }
  const data = await res.json();
  return extractJson(responseText(data));
}

/**
 * Fetch candidate pages cheaply (HTTP + render, NO model call) and return the
 * single richest-looking menu source. PDFs/images are taken immediately. We stop
 * early once a page clearly looks like a full menu, so we rarely fetch all of them
 * and we only ever run ONE expensive extraction afterwards.
 */
async function pickBestSource(urls: string[], remaining: () => number): Promise<MenuSource | null> {
  let best: MenuSource | null = null;
  let bestScore = -1;
  for (const url of urls) {
    // Only start a candidate if there's room to fetch/render it AND parse after.
    if (remaining() < 20_000) break;
    try {
      const src = await fetchMenuSource(url);
      if (src.kind !== 'html') return src; // a PDF or image menu — strongest possible
      const score = menuLikelihood(src.text);
      if (score > bestScore) {
        best = src;
        bestScore = score;
      }
      if (score >= STRONG_MENU_SIGNAL) break;
    } catch (e) {
      console.error('[Meet My Menu] find-menu candidate fetch failed:', url, e);
    }
  }
  return best;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { query } = (req.body ?? {}) as { query?: string };
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query required' });
  }

  // Stage budget. Vercel kills the function at 60s (vercel.json maxDuration), so
  // the search and the candidate fetch/parse must share one deadline (56s soft,
  // 4s headroom). Cap the search at 24s, then only fetch+parse while enough time
  // remains — otherwise the user hears an opaque 504 instead of the honest
  // "couldn't read it" message.
  const deadline = Date.now() + 56_000;
  const remaining = () => deadline - Date.now();

  try {
    const result = await searchForMenuUrls(query.trim().slice(0, 200), Math.min(24_000, remaining()));

    const restaurantName: string | null =
      typeof result?.restaurantName === 'string' && result.restaurantName.trim()
        ? result.restaurantName.trim()
        : null;
    const address: string | null =
      typeof result?.address === 'string' && result.address.trim() ? result.address.trim() : null;
    const candidates = sanitizeUrls(result?.menuUrls);

    // The model couldn't even identify the restaurant.
    if (result?.found === false && candidates.length === 0) {
      const reason =
        typeof result?.reason === 'string' && result.reason.trim()
          ? result.reason.trim()
          : "I couldn't find that restaurant online. Try adding the city, like 'Luigi's, Bloomington Indiana'.";
      return res.status(404).json({ error: reason, restaurantName });
    }

    // READ stage: scrape the best candidate and extract once.
    const best = await pickBestSource(candidates, remaining);
    if (best && remaining() > 9_000) {
      const menu = await parseMenuSource(best);
      if (menuItemCount(menu) >= 3) {
        if (!menu.restaurantName && restaurantName) menu.restaurantName = restaurantName;
        // Build provenance so the client can honestly explain source, location
        // scope, freshness, and completeness instead of presenting it as gospel.
        const cls = classifySource(best.url, best.kind === 'pdf');
        const pageText = best.kind === 'html' ? best.text : '';
        const locationScope = classifyLocationScope(pageText, best.url, address ?? query);
        const provenance = {
          sourceType: cls.sourceType,
          official: cls.official,
          sourceLabel: cls.sourceLabel,
          locationScope,
          confirmedLocation: address ?? undefined,
          sourceUrl: best.url,
          checkedAt: new Date().toISOString(),
          completeness: menu.incomplete ? 'partial' : 'complete',
          warnings: menu.incompleteReason ? [menu.incompleteReason] : undefined,
        };
        return res.status(200).json({
          menu,
          restaurantName: menu.restaurantName ?? restaurantName,
          address,
          sourceUrl: best.url,
          via: 'url',
          provenance,
        });
      }
    }

    // We located the restaurant but couldn't read a usable menu. Tell the truth —
    // never claim it "isn't posted online" (it usually is) and never invent items.
    const reason = restaurantName
      ? `I found ${restaurantName} but couldn't read their menu from their website. Try scanning the physical menu, or paste a direct link to their menu.`
      : "I found the restaurant but couldn't read their menu online. Try scanning the physical menu, or paste a direct link to their menu.";
    return res.status(404).json({ error: reason, restaurantName, address });
  } catch (e: any) {
    if (e instanceof FriendlyError) return res.status(e.status).json({ error: e.message });
    console.error('[Meet My Menu] find-menu error:', e);
    return res.status(502).json({ error: 'The restaurant search failed. Please try again in a moment.' });
  }
}
