// Text-to-speech playback. Prefers OpenAI TTS (warm voice); falls back to the
// browser's built-in speechSynthesis when there's no key or the call fails.
// Both paths resolve only AFTER speech finishes, so callers can enforce strict
// turn-taking (never listen while speaking).

import { synthesizeSpeech, hasApiKey } from './openai';

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
// Resolves the in-flight playback promise when speech is interrupted, so an
// awaited speak() never hangs (which would block the mic from ever starting).
let settleCurrent: (() => void) | null = null;
// True while any TTS (OpenAI or browser) is actively playing.
let _speaking = false;

/** Returns true while the app is currently speaking. Use to gate coach() cues. */
export function isSpeaking(): boolean {
  return _speaking;
}

export function stopSpeaking() {
  _speaking = false;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if (settleCurrent) {
    const s = settleCurrent;
    settleCurrent = null;
    s();
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
  _speaking = true;

  try {
    await new Promise<void>((resolve, reject) => {
      // stopSpeaking() pauses the audio but fires neither onended nor onerror;
      // it calls settleCurrent() to resolve us so an interrupt doesn't hang.
      settleCurrent = resolve;
      audio.onended = () => resolve();
      // CRITICAL: a play() rejection (iOS autoplay block) or media error must
      // REJECT, not resolve. Otherwise speak() returns having played nothing,
      // the browser-TTS fallback never runs, and the user hears silence with no
      // cue that it's their turn to talk.
      audio.onerror = () => reject(new Error('audio element error'));
      audio.play().catch(reject);
    });
  } finally {
    _speaking = false;
    if (settleCurrent) settleCurrent = null;
    if (currentUrl === url) {
      URL.revokeObjectURL(url);
      currentUrl = null;
    }
    if (currentAudio === audio) currentAudio = null;
  }
}

// Instant, free, local speech for real-time coaching (uses the browser voice,
// not the OpenAI network voice). Used by auto-capture so guidance has no latency
// and costs nothing. Separate from speak() so it never blocks turn-taking.
// Silenced if the main TTS (speak()) is active — never overlaps the primary voice.
export function coach(text: string) {
  if (_speaking) return;
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

// Keep a window-level reference to prevent iOS Safari from GC'ing the utterance
// mid-speech (which causes onend to never fire, hanging speak() forever).
const _win = window as Window & { _mvUtterance?: SpeechSynthesisUtterance };

function speakWithBrowser(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    _win._mvUtterance = u; // prevent iOS GC
    _speaking = true;
    u.onend = () => { _speaking = false; _win._mvUtterance = undefined; resolve(); };
    u.onerror = () => { _speaking = false; _win._mvUtterance = undefined; resolve(); };
    window.speechSynthesis.speak(u);
  });
}
