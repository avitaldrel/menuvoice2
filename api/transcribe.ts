import type { VercelRequest, VercelResponse } from '@vercel/node';

// Vercel's default body parser can't handle multipart. We stream the raw body
// straight through to OpenAI, preserving the Content-Type (with boundary).
export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'No API key configured on server.' });

  const contentType = req.headers['content-type'] ?? '';
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const body = Buffer.concat(chunks);

  const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': contentType },
    body: body as unknown as BodyInit,
  });
  const data = await upstream.json();
  res.status(upstream.status).json(data);
}
