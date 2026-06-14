// Shared logic for the morning report: pull the data, render it, send it.
// Used by api/morning.ts (on-demand view) and api/cron-morning.ts (daily email).
// Underscore prefix => Vercel does not expose this as an HTTP route.

import { createClient } from '@vercel/postgres';
import nodemailer from 'nodemailer';

export interface UserRow {
  user_email: string;
  events: number;
  sessions: number;
  first_in_window: string;
  last_in_window: string;
  failures: number;
  screens: string[] | null;
  menus: number;       // menus analyzed (ocr_result)
  questions: number;   // assistant replies (llm_reply)
  saves: number;       // restaurants saved
  finds: number;       // find-by-name searches
  first_ts: string;
  lifetime_sessions: number;
  is_new: boolean;
}

export interface MorningData {
  windowLabel: string;
  hours: number;
  generated: string;
  anyoneUsed: boolean;
  headline: Record<string, unknown>;
  newUsers: UserRow[];
  returningUsers: UserRow[];
  excluded: string[];
}

// Accounts we never want to see in the report (own testing). Override with the
// REPORT_EXCLUDE_EMAILS env var (comma-separated). Lower-cased + trimmed.
export function excludeList(): string[] {
  const raw = process.env.REPORT_EXCLUDE_EMAILS ?? '2firemaster27@gmail.com,avitaldrel@gmail.com';
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function withClient<T>(fn: (c: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const client = createClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export function fmtTs(ts: unknown): string {
  if (!ts) return '';
  const d = new Date(ts as string);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

export function ago(ts: unknown): string {
  if (!ts) return '';
  const then = new Date(ts as string).getTime();
  if (isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} mo ago` : `${Math.round(days / 365)} yr ago`;
}

export function esc(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// One human-readable line of "what they did" for a user.
export function activity(u: UserRow): string {
  const parts: string[] = [];
  if (Number(u.menus) > 0) parts.push(`${u.menus} menu${Number(u.menus) === 1 ? '' : 's'} scanned`);
  if (Number(u.questions) > 0) parts.push(`${u.questions} question${Number(u.questions) === 1 ? '' : 's'} asked`);
  if (Number(u.finds) > 0) parts.push(`${u.finds} restaurant search${Number(u.finds) === 1 ? '' : 'es'}`);
  if (Number(u.saves) > 0) parts.push(`${u.saves} saved`);
  return parts.length ? parts.join(', ') : 'browsed only';
}

export async function buildMorningReport(hours: number): Promise<MorningData> {
  hours = Math.min(Math.max(hours, 1), 24 * 365);
  const exclude = excludeList();
  const windowLabel = hours === 24 ? 'last 24 hours' : hours % 24 === 0 ? `last ${hours / 24} days` : `last ${hours} h`;
  const w = `now() - interval '${hours} hours'`;
  // Parameterized exclusion: $1 = lower-cased email array. Safe against injection.
  const notExcluded = `lower(user_email) <> ALL($1::text[])`;

  return withClient(async (client) => {
    const [headline, users] = await Promise.all([
      client.query(
        `SELECT
           count(*)                                                          AS events,
           count(DISTINCT session_id)                                        AS sessions,
           count(DISTINCT user_email) FILTER (WHERE user_email IS NOT NULL AND ${notExcluded}) AS users,
           count(DISTINCT session_id) FILTER (WHERE user_email IS NULL)      AS anon_sessions,
           count(*) FILTER (WHERE outcome='failure')                         AS failures,
           min(ts) AS first_ts, max(ts) AS last_ts
         FROM events
         WHERE ts > ${w} AND (user_email IS NULL OR ${notExcluded})`,
        [exclude]
      ),
      client.query(
        `WITH win AS (
           SELECT user_email,
                  count(*)                                   AS events,
                  count(DISTINCT session_id)                 AS sessions,
                  min(ts)                                    AS first_in_window,
                  max(ts)                                    AS last_in_window,
                  count(*) FILTER (WHERE outcome='failure')  AS failures,
                  count(*) FILTER (WHERE event_name='ocr_result') AS menus,
                  count(*) FILTER (WHERE event_name='llm_reply')  AS questions,
                  count(*) FILTER (WHERE event_name='saved')      AS saves,
                  count(*) FILTER (WHERE event_name IN ('search_start','find_by_name')) AS finds,
                  array_agg(DISTINCT screen) FILTER (WHERE screen IS NOT NULL) AS screens
           FROM events
           WHERE user_email IS NOT NULL AND ${notExcluded} AND ts > ${w}
           GROUP BY user_email
         ),
         life AS (
           SELECT user_email, min(ts) AS first_ts, count(DISTINCT session_id) AS lifetime_sessions
           FROM events WHERE user_email IS NOT NULL AND ${notExcluded}
           GROUP BY user_email
         )
         SELECT win.*, life.first_ts, life.lifetime_sessions, (life.first_ts > ${w}) AS is_new
         FROM win JOIN life USING (user_email)
         ORDER BY is_new DESC, win.last_in_window DESC`,
        [exclude]
      ),
    ]);

    const rows = users.rows as UserRow[];
    const h = headline.rows[0];
    // "Anyone used it" = any non-excluded signed-in user OR any anonymous session.
    const anyoneUsed = rows.length > 0 || Number(h.anon_sessions) > 0;
    return {
      windowLabel,
      hours,
      generated: fmtTs(new Date().toISOString()),
      anyoneUsed,
      headline: h,
      newUsers: rows.filter((u) => u.is_new),
      returningUsers: rows.filter((u) => !u.is_new),
      excluded: exclude,
    };
  });
}

// ---- Renderers ----

export function renderText(d: MorningData): string {
  const h = d.headline;
  const lines: string[] = [];
  lines.push(`MenuVoice morning report  (${d.windowLabel})`);
  lines.push(`generated ${d.generated}`);
  lines.push('');
  if (!d.anyoneUsed) {
    lines.push('No one used MenuVoice in this window.');
  } else {
    lines.push(`Yes, MenuVoice was used.`);
    lines.push(`  ${h.users} real user(s) + ${h.anon_sessions} anonymous session(s)`);
    lines.push(`  ${h.sessions} session(s), ${h.events} event(s), ${h.failures} failure(s)`);
    lines.push('');
    lines.push(`NEW users (${d.newUsers.length}):`);
    if (!d.newUsers.length) lines.push('  (none)');
    for (const u of d.newUsers) {
      lines.push(`  - ${u.user_email}  |  ${u.sessions} session(s)  |  ${activity(u)}  |  first seen ${fmtTs(u.first_in_window)}`);
    }
    lines.push('');
    lines.push(`Returning users (${d.returningUsers.length}):`);
    if (!d.returningUsers.length) lines.push('  (none)');
    for (const u of d.returningUsers) {
      lines.push(`  - ${u.user_email}  |  ${u.sessions} session(s) now / ${u.lifetime_sessions} lifetime  |  ${activity(u)}  |  joined ${ago(u.first_ts)}`);
    }
  }
  lines.push('');
  if (d.excluded.length) lines.push(`(excluded internal accounts: ${d.excluded.join(', ')})`);
  return lines.join('\n');
}

export function renderEmailHtml(d: MorningData, dashboardUrl?: string): string {
  const h = d.headline;
  const verdict = d.anyoneUsed
    ? `<p style="font-size:18px;padding:12px 16px;border-radius:10px;border:2px solid #1e8449;color:#1e8449;margin:0 0 16px">
         Yes — MenuVoice was used. <strong>${esc(h.users)}</strong> real user(s) and <strong>${esc(h.anon_sessions)}</strong> anonymous session(s).</p>`
    : `<p style="font-size:18px;padding:12px 16px;border-radius:10px;border:2px solid #c0392b;color:#c0392b;margin:0 0 16px">
         No one used MenuVoice in this window.</p>`;

  const th = 'text-align:left;padding:6px 10px;border-bottom:2px solid #888;font-size:13px;text-transform:uppercase;letter-spacing:.03em';
  const td = 'padding:6px 10px;border-bottom:1px solid #ddd;font-size:14px;vertical-align:top';
  const tdr = td + ';text-align:right';

  const newRows = d.newUsers.length
    ? d.newUsers.map((u) =>
        `<tr><td style="${td}">${esc(u.user_email)}</td><td style="${tdr}">${esc(u.sessions)}</td>` +
        `<td style="${td}">${esc(activity(u))}</td><td style="${td}">${esc(fmtTs(u.first_in_window))}</td></tr>`
      ).join('')
    : `<tr><td style="${td}" colspan="4"><em>No new users in this window.</em></td></tr>`;

  const retRows = d.returningUsers.length
    ? d.returningUsers.map((u) =>
        `<tr><td style="${td}">${esc(u.user_email)}</td><td style="${tdr}">${esc(u.sessions)} / ${esc(u.lifetime_sessions)}</td>` +
        `<td style="${td}">${esc(activity(u))}</td><td style="${td}">${esc(ago(u.first_ts))}</td></tr>`
      ).join('')
    : `<tr><td style="${td}" colspan="4"><em>No returning users in this window.</em></td></tr>`;

  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#222;max-width:720px;margin:0 auto;padding:8px">
  <h1 style="font-size:22px;margin:0 0 4px">MenuVoice morning report</h1>
  <p style="opacity:.7;font-size:13px;margin:0 0 16px">${esc(d.windowLabel)} &middot; generated ${esc(d.generated)}</p>
  ${verdict}
  <h2 style="font-size:16px;border-bottom:2px solid #222;padding-bottom:4px">New users (${esc(d.newUsers.length)})</h2>
  <table style="border-collapse:collapse;width:100%">
    <thead><tr><th style="${th}">User</th><th style="${th};text-align:right">Sessions</th><th style="${th}">What they did</th><th style="${th}">First seen</th></tr></thead>
    <tbody>${newRows}</tbody>
  </table>
  <h2 style="font-size:16px;border-bottom:2px solid #222;padding-bottom:4px;margin-top:24px">Returning users (${esc(d.returningUsers.length)})</h2>
  <table style="border-collapse:collapse;width:100%">
    <thead><tr><th style="${th}">User</th><th style="${th};text-align:right">Sessions now / lifetime</th><th style="${th}">What they did</th><th style="${th}">Joined</th></tr></thead>
    <tbody>${retRows}</tbody>
  </table>
  ${dashboardUrl ? `<p style="margin-top:24px;font-size:13px"><a href="${esc(dashboardUrl)}">Open full dashboard</a></p>` : ''}
  ${d.excluded.length ? `<p style="opacity:.6;font-size:12px;margin-top:16px">Excluded internal accounts: ${esc(d.excluded.join(', '))}</p>` : ''}
  </body></html>`;
}

// ---- Email delivery ----
// Prefers Resend (RESEND_API_KEY, no SMTP egress needed); falls back to Gmail
// SMTP (GMAIL_USER + GMAIL_APP_PASSWORD). Throws if neither is configured.
export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<string> {
  const { to, subject, html, text } = opts;

  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM ?? 'MenuVoice <onboarding@resend.dev>';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!r.ok) throw new Error(`Resend failed: ${r.status} ${await r.text()}`);
    return 'resend';
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    await transport.sendMail({ from: user, to, subject, text, html });
    return 'gmail';
  }

  throw new Error('No email transport configured. Set RESEND_API_KEY, or GMAIL_USER + GMAIL_APP_PASSWORD.');
}
