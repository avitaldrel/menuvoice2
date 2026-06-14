// Unified "Find a menu" screen — one box for ANYTHING.
//
// The user types a restaurant NAME ("Luigi's Pizza, Springfield"), pastes a
// website LINK, or a direct PDF/menu URL. We detect which it is and route to the
// right server pipeline:
//   - looks like a URL  -> parseMenuFromUrl (fetch + parse the page/PDF)
//   - otherwise (a name) -> findMenuByName (web search + read their site)
// If the menu isn't online, we say so plainly. One place to put anything.

import { useEffect, useRef, useState } from 'react';
import { Screen, Title, Body, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps } from '../nav';
import { findMenuByName, parseMenuFromUrl, hasApiKey } from '../lib/openai';
import { saveRestaurant } from '../lib/storage';
import { speak, stopSpeaking } from '../lib/speech';
import { track } from '../lib/telemetry';

const SEARCH_PHRASES = [
  'Still searching for their menu, hang tight.',
  'Reading their website now, almost there.',
  'Still working on it, one more moment.',
];

// A single token with a dot and a real-looking ending is a link
// (restaurant.com, site.com/menu, a .pdf). Anything with a space is a name
// ("Luigi's Pizza, Springfield"). An explicit scheme is always a link.
function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  if (/^https?:\/\//i.test(t)) return true;
  if (/\s/.test(t)) return false;
  return /^[^\s]+\.[a-z]{2,}(\/|\?|$)/i.test(t);
}

export default function FindScreen({ navigate, goBack }: ScreenProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const reassureRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    speak('Find a menu. Type a restaurant name with the city, like Burger Bros, Springfield, or paste a website link. Then tap Find menu.');
    return () => {
      if (reassureRef.current) clearInterval(reassureRef.current);
      stopSpeaking();
    };
  }, []);

  const announce = (msg: string) => {
    setStatus(msg);
    speak(msg);
  };

  const find = async () => {
    if (inFlightRef.current) return; // a search is already running
    const trimmed = query.trim();
    if (!trimmed) { announce('Please type a restaurant name or paste a link first.'); return; }
    if (!hasApiKey()) {
      announce('No API key configured. Set OPENAI_API_KEY in Vercel environment variables.');
      return;
    }

    const isUrl = looksLikeUrl(trimmed);

    if (!isUrl && !trimmed.includes(',')) {
      announce('Please include the city so I find the right location. For example: Burger Bros, Springfield.');
      return;
    }

    inFlightRef.current = true;
    setLoading(true);

    try {
      if (isUrl) {
        let fullUrl = trimmed;
        if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
        track('find', 'submit_url', { metadata: { url: fullUrl } });
        announce('Reading the menu from that link. This may take a moment.');
        const menu = await parseMenuFromUrl(fullUrl);
        const restaurantName = menu.restaurantName?.trim() || 'This restaurant';
        await saveRestaurant(restaurantName, menu).catch(() => {});
        navigate({ name: 'conversation', menu, restaurantName, source: 'url' });
        return;
      }

      // A restaurant name — web search can be slow, so reassure periodically.
      track('find', 'search_start', { content: { query: trimmed } });
      announce(`Searching for ${trimmed} and their menu. This can take up to a minute.`);
      let i = 0;
      reassureRef.current = setInterval(() => {
        announce(SEARCH_PHRASES[i % SEARCH_PHRASES.length]);
        i++;
      }, 9000);

      const { menu, restaurantName, sourceUrl } = await findMenuByName(trimmed);
      if (reassureRef.current) clearInterval(reassureRef.current);
      const name = restaurantName?.trim() || trimmed;
      await saveRestaurant(name, menu, sourceUrl).catch(() => {});
      navigate({ name: 'conversation', menu, restaurantName: name, source: 'find' });
    } catch (e: any) {
      if (reassureRef.current) clearInterval(reassureRef.current);
      inFlightRef.current = false;
      setLoading(false);
      const fallback = isUrl
        ? "Hey, sorry. I couldn't read the menu from that link. Try a different link, or just type the restaurant's name."
        : "I couldn't find that restaurant's menu online. Try adding the city to the name.";
      announce(e?.message ?? fallback);
    }
  };

  return (
    <Screen>
      <Title>Find a menu</Title>
      <Body>
        Type a restaurant name and city (for example: Burger Bros, Springfield), or paste a website link or PDF.
        The city is required so I find the right location.
      </Body>

      <input
        className="input"
        type="text"
        inputMode="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !loading) find(); }}
        placeholder="Luigi's Pizza, Springfield   or   restaurant.com/menu"
        aria-label="Restaurant name or website link"
        disabled={loading}
        style={{ fontSize: 18 }}
      />

      <p
        className="body"
        role="status"
        aria-live="polite"
        style={{ textAlign: 'center', minHeight: 28 }}
      >
        {status}
      </p>

      <PrimaryButton
        label={loading ? 'Finding…' : 'Find menu'}
        hint="Find this restaurant's menu and read it to me"
        onClick={find}
        disabled={loading}
        style={{ minHeight: 80 }}
      />
      <SecondaryButton label="Cancel" onClick={goBack} disabled={loading} />
    </Screen>
  );
}
