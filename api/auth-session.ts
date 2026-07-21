// POST /api/auth-session  { idToken }  ->  { sessionToken, email }
//
// Exchanges a fresh Google ID token (received client-side from Sign-In) for a
// longer-lived MenuVoice session token. The client calls this once right
// after Google sign-in, then sends the returned sessionToken as
// `Authorization: Bearer <token>` on every /api/sync call — see api/_auth.ts
// for why the exchange exists (Google ID tokens expire in ~1 hour).
//
// Email-only login has no verifiable credential and cannot call this
// endpoint; those sessions stay local-only by design (bug #20).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyGoogleIdToken, createSessionToken } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { idToken } = (req.body ?? {}) as { idToken?: string };
  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'idToken required' });
  }

  const identity = await verifyGoogleIdToken(idToken);
  if (!identity) {
    return res.status(401).json({ error: 'Could not verify that sign-in. Please try signing in again.' });
  }

  try {
    const sessionToken = await createSessionToken(identity.email);
    return res.status(200).json({ sessionToken, email: identity.email });
  } catch (e) {
    console.error('[MenuVoice] session token creation failed:', e);
    return res.status(500).json({ error: 'Sign-in is not fully configured on the server.' });
  }
}
