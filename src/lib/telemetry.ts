// Client-side telemetry. Batches events in memory, persists to localStorage
// for crash-safety, and flushes to /api/events on a timer and on page hide.
// Fire-and-forget: telemetry errors never surface to callers.

const SESSION_KEY = 'mv.tel.sid';
const QUEUE_KEY = 'mv.tel.queue';
const FLUSH_MS = 10_000;
const MAX_BATCH = 50;

export interface TelEvent {
  client_ts: string;
  user_email?: string;
  session_id: string;
  screen?: string;
  event_type: string;
  event_name: string;
  outcome?: 'success' | 'failure';
  duration_ms?: number;
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  app_version: string;
  user_agent: string;
}

let _sid = '';
let _queue: TelEvent[] = [];
let _screen = 'home';
let _t0 = Date.now();

function sid(): string {
  if (_sid) return _sid;
  try {
    _sid = sessionStorage.getItem(SESSION_KEY) ?? `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(SESSION_KEY, _sid);
  } catch {
    _sid = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return _sid;
}

function email(): string | undefined {
  try {
    const raw = localStorage.getItem('menuvoice.profile.v1');
    return raw ? (JSON.parse(raw)?.email as string) || undefined : undefined;
  } catch { return undefined; }
}

function persist() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(_queue)); } catch {}
}

function restore(): TelEvent[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as TelEvent[]; } catch { return []; }
}

export function setCurrentScreen(screen: string) { _screen = screen; }

export function track(
  type: string,
  name: string,
  opts: {
    content?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    outcome?: 'success' | 'failure';
    durationMs?: number;
    screen?: string;
  } = {}
) {
  try {
    _queue.push({
      client_ts: new Date().toISOString(),
      user_email: email(),
      session_id: sid(),
      screen: opts.screen ?? _screen,
      event_type: type,
      event_name: name,
      outcome: opts.outcome,
      duration_ms: opts.durationMs,
      content: opts.content,
      metadata: opts.metadata,
      app_version: String((import.meta.env as Record<string, unknown>).VITE_APP_VERSION ?? '1.0.0'),
      user_agent: navigator.userAgent,
    });
    persist();
  } catch {}
}

async function flush(beacon = false) {
  if (!_queue.length) return;
  const batch = _queue.splice(0, MAX_BATCH);
  persist();
  const body = JSON.stringify({ events: batch });
  if (beacon && navigator.sendBeacon) {
    const ok = navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    if (!ok) { _queue.unshift(...batch); persist(); }
    return;
  }
  try {
    const r = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
    if (!r.ok) { _queue.unshift(...batch); persist(); }
  } catch { _queue.unshift(...batch); persist(); }
}

export function isImageLoggingOn(): boolean {
  try { return !!(JSON.parse(localStorage.getItem('menuvoice.profile.v1') ?? '{}') as { imageLogging?: boolean }).imageLogging; } catch { return false; }
}

export function initTelemetry() {
  _queue = restore();
  _t0 = Date.now();
  track('session', 'start');
  setInterval(() => { flush().catch(() => {}); }, FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => {
    track('session', 'end', { durationMs: Date.now() - _t0 });
    flush(true);
  }, { capture: true });
}
