import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const ts = new Date().toISOString();
    await redis.sadd('menuvoice:waitlist', email);
    await redis.lpush('menuvoice:waitlist:log', JSON.stringify({ email, ts }));
    await redis.ltrim('menuvoice:waitlist:log', 0, 9999);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Waitlist signup failed', error);
    return res.status(500).json({ error: 'Unable to save signup' });
  }
}
