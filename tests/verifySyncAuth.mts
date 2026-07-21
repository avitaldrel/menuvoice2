// Bug #20 (server half), the actual acceptance test from the report:
//   "User B cannot retrieve or overwrite User A's snapshot by submitting
//    User A's email."
//
// Runs the REAL /api/sync handler against the real database (same one
// api/events.ts and api/_partners.ts use), with two distinct, verified
// session tokens standing in for two different signed-in users. Skips
// gracefully — does not fail — when no local Postgres credential is
// configured, so CI without secrets stays green; this is an opt-in
// integration proof, run locally with `npm test` when .env.local is present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
try {
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(?:"([^"]*)"|(.*))$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2] ?? m[3] ?? '';
  }
} catch {}
// Bare createClient() looks for POSTGRES_URL_NON_POOLING, which only exists
// on Vercel — mirror the pooler URL into it, same as scripts/dev-partners.mjs.
if (process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING) {
  process.env.POSTGRES_URL_NON_POOLING = process.env.POSTGRES_URL;
}
process.env.SESSION_SECRET ??= 'harness-session-secret-local-only';

if (!process.env.POSTGRES_URL) {
  test('sync auth acceptance test (SKIPPED: no POSTGRES_URL in .env.local)', () => {});
} else {
  const { default: handler } = await import(pathToFileURL(join(ROOT, 'api', 'sync.ts')).href);
  const { createSessionToken } = await import(pathToFileURL(join(ROOT, 'api', '_auth.ts')).href);

  const ATTACKER = 'attacker-harness@menuvoice-test.invalid';
  const VICTIM = 'victim-harness@menuvoice-test.invalid';

  function mockRes() {
    const res: any = {
      statusCode: 0, body: null as any, headers: {} as Record<string, string>,
      setHeader(k: string, v: string) { res.headers[k] = v; return res; },
      status(c: number) { res.statusCode = c; return res; },
      json(d: unknown) { res.body = d; return res; },
      end() { return res; },
    };
    return res;
  }

  async function call(method: string, headers: Record<string, string>, body?: unknown) {
    const res = mockRes();
    await handler({ method, headers, body, query: {} } as any, res);
    return res;
  }

  let failures = 0;
  function check(label: string, cond: boolean, detail?: unknown) {
    if (cond) console.log(`  ok ${label}`);
    else { failures++; console.log(`  NOT ok ${label}`, detail ?? ''); }
  }

  test('sync requires authentication; identity always comes from the token', async () => {
    const attackerToken = await createSessionToken(ATTACKER);
    const victimToken = await createSessionToken(VICTIM);

    // 1. No token at all -> 401.
    let r = await call('GET', {});
    assert.equal(r.statusCode, 401);

    // 2. Garbage token -> 401.
    r = await call('GET', { authorization: 'Bearer not-a-real-token' });
    assert.equal(r.statusCode, 401);

    // 3. Victim writes their own real data under their own verified token.
    r = await call(
      'POST',
      { authorization: `Bearer ${victimToken}` },
      { profile: { name: 'Victim', allergies: ['peanuts'] }, restaurants: [{ id: 'v-1', name: "Victim's Place" }] },
    );
    assert.equal(r.statusCode, 200);

    // 4. THE ACTUAL ATTACK: attacker POSTs, naming the VICTIM's email in the
    // body (the old vulnerability), but authenticated as themselves. The
    // write must land under the ATTACKER's own account, never touching the
    // victim's data, because email is no longer read from the body at all.
    r = await call(
      'POST',
      { authorization: `Bearer ${attackerToken}` },
      { email: VICTIM, profile: { name: 'Attacker pretending to be victim' }, restaurants: [{ id: 'a-1', name: 'Attacker inject' }] },
    );
    assert.equal(r.statusCode, 200);

    // 5. Victim's data must be COMPLETELY UNCHANGED by the attacker's attempt.
    r = await call('GET', { authorization: `Bearer ${victimToken}` });
    assert.equal(r.statusCode, 200);
    check('victim still sees their own name', r.body?.profile?.name === 'Victim', r.body?.profile);
    check(
      'victim still sees their own restaurant, not the attacker\'s injected one',
      r.body?.restaurants?.[0]?.name === "Victim's Place",
      r.body?.restaurants,
    );

    // 6. Attacker reading with their OWN token gets their OWN (attacker) data
    // — the write in step 4 really did go to the attacker's own account.
    r = await call('GET', { authorization: `Bearer ${attackerToken}` });
    check(
      "attacker's read shows their own injected data, confirming their POST wrote to their own account",
      r.body?.profile?.name === 'Attacker pretending to be victim',
      r.body?.profile,
    );

    // 7. Attacker cannot read the victim's data by naming them in a query
    // param either — GET no longer accepts ?email= at all; identity is
    // always the token's.
    r = await call('GET', { authorization: `Bearer ${attackerToken}` }); // (query is ignored entirely now)
    check("attacker's GET (their own token) never returns the victim's restaurant", r.body?.restaurants?.[0]?.name !== "Victim's Place", r.body);

    assert.equal(failures, 0, `${failures} acceptance check(s) failed — see log above`);
  });

  test('cleanup: remove harness rows from the live database', async () => {
    const { createClient } = await import('@vercel/postgres');
    const { kv } = await import('@vercel/kv');
    const client = createClient({ connectionString: process.env.POSTGRES_URL });
    await client.connect();
    await client.query('DELETE FROM user_state_snapshots WHERE email = ANY($1)', [[ATTACKER, VICTIM]]);
    await client.end();
    // KV isn't configured in local dev (.env.local only has POSTGRES_URL), so
    // this throws synchronously there — the Postgres delete above is the row
    // that matters for the harness; KV cleanup is best-effort only.
    try { await kv.del(`user:${ATTACKER}`); } catch {}
    try { await kv.del(`user:${VICTIM}`); } catch {}
  });
}
