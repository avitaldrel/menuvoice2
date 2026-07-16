// Cartesia API key rotation.
//
// Cartesia free/credit accounts run dry quickly, so we let the app hold several
// keys and fail over to the next one the moment a key hits a credit/quota wall.
// OpenAI is still the final fallback (handled by each caller) once every Cartesia
// key is exhausted.
//
// Keys are read from any of:
//   CARTESIA_API_KEYS   — comma-separated list ("sk_car_a, sk_car_b")
//   CARTESIA_API_KEY    — single key (back-compat)
//   CARTESIA_API_KEY_1..CARTESIA_API_KEY_10 — numbered keys

import { looksLikeCartesiaCreditIssue, maybeNotifyCartesiaCreditIssue } from './_providerAlerts.js';
import {
  getCartesiaStatus,
  recordAllCartesiaExhausted,
  recordCartesiaExhausted,
  recordCartesiaSuccess,
} from './_cartesiaStatus.js';

interface CartesiaKeyEntry { key: string; slot: number }

function cartesiaKeyEntries(): CartesiaKeyEntry[] {
  return cartesiaApiKeys().map((key, index) => ({ key, slot: index + 1 }));
}

export function cartesiaApiKeys(): string[] {
  const out: string[] = [];
  const add = (v?: string) => {
    if (!v) return;
    for (const part of v.split(',')) {
      const k = part.trim();
      if (k) out.push(k);
    }
  };
  add(process.env.CARTESIA_API_KEYS);
  add(process.env.CARTESIA_API_KEY);
  for (let i = 1; i <= 10; i += 1) add(process.env[`CARTESIA_API_KEY_${i}`]);
  return Array.from(new Set(out));
}

/**
 * Calls `attempt` once per Cartesia key, rotating to the next key whenever the
 * current one fails with a credit/quota error. Returns:
 *   - the first response that is NOT a credit failure (a success, or a real
 *     error like bad input that another key wouldn't fix), or
 *   - null when every key is out of credits — the caller should then fall back
 *     to OpenAI.
 * Emails a single credit alert only once all keys are exhausted.
 */
export async function withCartesiaKey(
  service: 'tts' | 'stt' | 'realtime-stt-token',
  attempt: (key: string) => Promise<Response>,
  estimatedCreditsOnSuccess = 0,
): Promise<Response | null> {
  const keys = cartesiaKeyEntries();
  if (keys.length === 0) return null;
  const status = await getCartesiaStatus(keys.length);
  const exhaustedSlots = new Set(status.keys.filter((k) => k.status === 'exhausted').map((k) => k.slot));
  const ordered = keys.filter((entry) => !exhaustedSlots.has(entry.slot));

  if (ordered.length === 0) {
    await recordAllCartesiaExhausted();
    return null;
  }

  let lastCreditStatus = 0;
  let lastCreditDetail: string | undefined;

  for (const { key, slot } of ordered) {
    let res: Response;
    try {
      res = await attempt(key);
    } catch (error) {
      // Transport failure on this key — try the next one.
      lastCreditDetail = String((error as Error)?.message ?? error);
      continue;
    }

    if (res.ok) {
      await recordCartesiaSuccess(slot, new Date(), estimatedCreditsOnSuccess);
      return res;
    }

    const detail = await res.clone().text().catch(() => '');
    if (looksLikeCartesiaCreditIssue(res.status, detail)) {
      await recordCartesiaExhausted(slot);
      lastCreditStatus = res.status;
      lastCreditDetail = detail;
      continue; // rotate to the next key
    }

    // Non-credit error (bad request, upstream 5xx). Other keys would fail the
    // same way, so hand this response back instead of burning the rest.
    return res;
  }

  // Every key is out of credits/quota. Alert once, then signal "fall back".
  if (lastCreditStatus) {
    const after = await getCartesiaStatus(keys.length);
    if (after.allExhausted) await recordAllCartesiaExhausted();
    await maybeNotifyCartesiaCreditIssue({ service, status: lastCreditStatus, detail: lastCreditDetail });
  }
  return null;
}
