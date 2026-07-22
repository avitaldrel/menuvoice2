import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cartesiaApiKeys, withCartesiaKey } from './_cartesia.js';
import { enforceRateLimit } from './_rateLimit.js';

// Vercel's default body parser can't handle multipart. We stream the raw body
// straight through to OpenAI, preserving the Content-Type (with boundary).
export const config = { api: { bodyParser: false } };

const CARTESIA_VERSION = '2026-03-01';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '', 'http://localhost');
  if (req.method === 'POST' && url.searchParams.get('cartesiaToken') === '1') {
    return cartesiaToken(res);
  }
  if (req.method !== 'POST') return res.status(405).end();
  // Body parsing is off for multipart, so identity comes from the session
  // header or the client IP rather than a parsed body.
  if (!(await enforceRateLimit(req, res, 'transcribe'))) return;
  const contentType = req.headers['content-type'] ?? '';
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const body = Buffer.concat(chunks);

  if (process.env.CARTESIA_STT_ENABLED === 'true') {
    const cartesia = await transcribeWithCartesia(contentType, body).catch((error) => {
      console.warn('Cartesia STT failed, falling back to OpenAI:', error);
      return null;
    });
    if (cartesia) {
      res.setHeader('X-Voice-Provider', 'cartesia');
      return res.status(200).json(cartesia);
    }
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'No API key configured on server.' });
  const openaiBody = bodyForOpenAiTranscription(contentType, body);

  const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': contentType },
    body: openaiBody as unknown as BodyInit,
  });
  const data = await upstream.json();
  res.setHeader('X-Voice-Provider', 'openai');
  res.status(upstream.status).json(data);
}

export function bodyForOpenAiTranscription(contentType: string, body: Buffer): Buffer {
  if (!contentType.includes('multipart/form-data')) return body;
  const boundary = multipartBoundary(contentType);
  if (!boundary) return body;

  const boundaryMarker = `--${boundary}`;
  const headerSeparator = '\r\n\r\n';
  let partStart = body.indexOf(boundaryMarker, 0, 'latin1');

  while (partStart !== -1) {
    const afterBoundary = partStart + Buffer.byteLength(boundaryMarker, 'latin1');
    if (body.subarray(afterBoundary, afterBoundary + 2).toString('ascii') === '--') return body;

    const contentStart = body.subarray(afterBoundary, afterBoundary + 2).toString('ascii') === '\r\n'
      ? afterBoundary + 2
      : afterBoundary;
    const nextBoundary = body.indexOf(boundaryMarker, contentStart, 'latin1');
    if (nextBoundary === -1) return body;

    const headerEnd = body.indexOf(headerSeparator, contentStart, 'latin1');
    if (headerEnd !== -1 && headerEnd < nextBoundary) {
      const headers = body.subarray(contentStart, headerEnd).toString('latin1');
      if (/content-disposition:\s*form-data\b/i.test(headers) && /name="model"/i.test(headers)) {
        const valueStart = headerEnd + Buffer.byteLength(headerSeparator, 'latin1');
        const valueEnd = body.subarray(nextBoundary - 2, nextBoundary).toString('ascii') === '\r\n'
          ? nextBoundary - 2
          : nextBoundary;
        const replacement = Buffer.from('whisper-1');
        const rewritten = Buffer.allocUnsafe(valueStart + replacement.length + body.length - valueEnd);
        let writeOffset = 0;
        for (let index = 0; index < valueStart; index += 1) rewritten[writeOffset++] = body[index];
        for (const byte of replacement) rewritten[writeOffset++] = byte;
        for (let index = valueEnd; index < body.length; index += 1) rewritten[writeOffset++] = body[index];
        return rewritten;
      }
    }

    partStart = nextBoundary;
  }

  return body;
}

function multipartBoundary(contentType: string): string | null {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return (match?.[1] ?? match?.[2] ?? '').trim() || null;
}

async function cartesiaToken(res: VercelResponse) {
  if (process.env.CARTESIA_REALTIME_STT_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Cartesia realtime STT is not enabled.' });
  }

  if (cartesiaApiKeys().length === 0) {
    return res.status(500).json({ error: 'No Cartesia API key configured.' });
  }

  // Rotate across keys; null means every key is out of credits.
  const upstream = await withCartesiaKey('realtime-stt-token', (key) =>
    fetch('https://api.cartesia.ai/access-token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Cartesia-Version': CARTESIA_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grants: { stt: true },
        expires_in: 60,
      }),
    }),
  );
  if (!upstream) {
    return res.status(402).json({ error: 'All Cartesia keys are out of credits.' });
  }

  const raw = await upstream.text().catch(() => '');
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!upstream.ok) {
    const error = data?.message ?? data?.error ?? data?.title ?? data?.raw ?? 'Cartesia token request failed.';
    console.warn('Cartesia access-token failed:', { status: upstream.status, error });
    return res.status(upstream.status).json({ error });
  }

  const token = data?.token ?? data?.access_token;
  if (!token) return res.status(502).json({ error: 'Cartesia token response did not include a token.' });
  return res.status(200).json({ token, expires_in: data?.expires_in ?? 60 });
}

async function transcribeWithCartesia(contentType: string, body: Buffer): Promise<{ text: string } | null> {
  if (!contentType.includes('multipart/form-data')) return null;

  // Rotate across keys; null/non-OK -> caller falls back to OpenAI Whisper.
  const upstream = await withCartesiaKey('stt', (key) =>
    fetch('https://api.cartesia.ai/stt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Cartesia-Version': CARTESIA_VERSION,
        'Content-Type': contentType,
      },
      body: body as unknown as BodyInit,
    }),
  );
  if (!upstream || !upstream.ok) return null;

  const raw = await upstream.text().catch(() => '');
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  return { text: (data?.text ?? '').trim() };
}
