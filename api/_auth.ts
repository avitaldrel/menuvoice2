// Server-side identity verification (bug #20).
//
// /api/sync used to trust a bare `email` field supplied by the request, with
// no proof the caller was ever that person. This module is the fix: identity
// for cloud sync now comes ONLY from a cryptographically verified source.
//
// Two steps:
//   1. Login: the client sends the Google ID token it just received from
//      Sign-In. verifyGoogleIdToken() checks its signature against Google's
//      own public keys, its audience (must be THIS app's client ID), and that
//      Google itself verified the email — never trust a client-decoded JWT.
//   2. Session: Google ID tokens expire in ~1 hour, too short to keep sync
//      working across a normal usage period. On a successful verify, the
//      server mints its OWN signed session token (createSessionToken) that
//      the client stores and sends on every later /api/sync call. Verifying
//      our own HS256 token needs no network call, unlike re-checking Google's
//      JWKS on every request.
//
// Both verification functions fail CLOSED: any error (network, malformed
// token, wrong audience, expired) returns null, never "let it through". This
// is the opposite of api/_rateLimit.ts's fail-open stance, and deliberately
// so — a broken rate limiter costs money; a broken auth check costs privacy.

import { jwtVerify, SignJWT, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import type { CryptoKey, KeyObject, JWK } from 'jose';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface VerifiedIdentity {
  email: string;
}

/**
 * Verify a Google ID token: signature (against Google's live JWKS), issuer,
 * audience (must match GOOGLE_CLIENT_ID), and that Google itself marked the
 * email verified. `getKey` is only ever overridden in tests, to verify
 * against a locally-issued token instead of a real Google one.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  getKey: JWTVerifyGetKey | CryptoKey | KeyObject | JWK | Uint8Array = GOOGLE_JWKS,
): Promise<VerifiedIdentity | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !idToken) return null;
  try {
    const { payload } = await jwtVerify(idToken, getKey as JWTVerifyGetKey, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
    });
    if (payload.email_verified !== true) return null;
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    return email ? { email } : null;
  } catch {
    return null;
  }
}

const SESSION_ISSUER = 'menuvoice-sync';
const SESSION_TTL = '30d';

function sessionSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return new TextEncoder().encode(secret);
}

/** Mint a MenuVoice session token for an already-verified email. */
export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email: email.trim().toLowerCase() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(SESSION_ISSUER)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(sessionSecretKey());
}

/** Verify a MenuVoice session token minted by createSessionToken. */
export async function verifySessionToken(token: string): Promise<VerifiedIdentity | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey(), { issuer: SESSION_ISSUER });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    return email ? { email } : null;
  } catch {
    return null;
  }
}

/** Pull the token out of an `Authorization: Bearer <token>` header value. */
export function bearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1].trim() : null;
}
