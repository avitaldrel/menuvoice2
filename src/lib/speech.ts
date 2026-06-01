// Text-to-speech playback. Prefers OpenAI TTS (warm voice); falls back to the
// browser's built-in speechSynthesis when there's no key or the call fails.
// Both paths resolve only AFTER speech finishes, so callers can enforce strict
// turn-taking (never listen while speaking).

import { synthesizeSpeech, hasApiKey } from './openai';

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

export async function speak(text: string, voice?: string): Promise<void> {
  stopSpeaking();
  if (!text.trim()) return;

  if (hasApiKey()) {
    try {
      await speakWithOpenAI(text, voice);
      return;
    } catch (e) {
      console.warn('OpenAI TTS failed, falling back to browser voice:', e);
    }
  }
  await speakWithBrowser(text);
}

async function speakWithOpenAI(text: string, voice?: string): Promise<void> {
  const blob = await synthesizeSpeech(text, voice);
  const url = URL.createObjectURL(blob);
  currentUrl = url;
  const audio = new Audio(url);
  currentAudio = audio;

  await new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });

  if (currentUrl === url) {
    URL.revokeObjectURL(url);
    currentUrl = null;
  }
  if (currentAudio === audio) currentAudio = null;
}

// Instant, free, local speech for real-time coaching (uses the browser voice,
// not the OpenAI network voice). Used by auto-capture so guidance has no latency
// and costs nothing. Separate from speak() so it never blocks turn-taking.
export function coach(text: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {}
}

export function stopCoach() {
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

function speakWithBrowser(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}
