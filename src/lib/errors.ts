// Plain-language recovery messages.
//
// Users of a voice-first app HEAR errors, so they must never hear "Failed to
// fetch", HTTP codes, or developer wording. Every catch site routes through
// friendlyError(): the technical detail goes to the console (and telemetry at
// the call site); the user gets a calm sentence that says what to do next.

const NETWORK_MSG = "I couldn't connect. Check your internet connection, then try again.";
const TIMEOUT_MSG = 'That took too long. Please try again.';
const BUSY_MSG = "I'm a little busy right now. Wait a few seconds and try again.";
const SERVER_MSG = 'Something went wrong on my end. Please try again in a moment.';
const PARSE_MSG = "I had trouble reading that menu. Let's try again.";

// Signals that a message was written for developers, not users. If any of
// these appear we NEVER pass the raw text through.
const TECH_MARKERS =
  /failed to fetch|networkerror|network request failed|load failed|err_|econn|enotfound|typeerror|referenceerror|syntaxerror|unexpected token|json|api key|openai|http|status code|\b[45]\d\d\b|exception|undefined|null|stack|cors|ssl|certificate|vercel|env|configuration/i;

/**
 * Convert any thrown value into a sentence safe to display AND speak.
 * `fallback` is the context-specific recovery line ("Try retaking the photos
 * with more light."). Our own user-facing throws pass through untouched.
 */
export function friendlyError(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  // Keep the real detail available for debugging without surfacing it.
  if (raw) console.warn('MenuVoice error (technical detail):', e);
  if (!raw) return fallback;

  const t = raw.toLowerCase();
  if (t.includes('failed to fetch') || t.includes('networkerror') || t.includes('network request failed') || t.includes('load failed') || t.includes('offline'))
    return NETWORK_MSG;
  if (t.includes('timed out') || t.includes('timeout') || t.includes('abort'))
    return TIMEOUT_MSG;
  if (t.includes('rate limit') || t.includes('too many requests') || t.includes('429'))
    return BUSY_MSG;
  if (t.includes('unexpected token') || t.includes('parse') || t.includes('malformed'))
    return PARSE_MSG;
  if (TECH_MARKERS.test(t)) return SERVER_MSG;

  // No tech markers: this is one of our own already-friendly messages.
  return raw;
}

/** Friendly line for when the AI/menu service is not configured or reachable. */
export const SERVICE_UNAVAILABLE_MSG =
  "The menu reader isn't available right now. Please try again in a few minutes.";
