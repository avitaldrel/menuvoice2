// Text-to-speech playback. Prefers OpenAI TTS (warm voice); falls back to the
// browser's built-in speechSynthesis when there's no key or the call fails.

import { synthesizeSpeech, hasApiKey } from './openai';

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
// Resolves the in-flight playUtterance promise so stopSpeaking() never hangs.
let settleCurrent: (() => void) | null = null;
// True while any TTS is actively playing.
let _speaking = false;
// Cancel hook for an active streaming-speech handle.
let activeStreamCancel: (() => void) | null = null;

export function isSpeaking(): boolean {
  return _speaking;
}

export function stopSpeaking() {
  _speaking = false;
  if (activeStreamCancel) {
    const cancel = activeStreamCancel;
    activeStreamCancel = null;
    cancel();
  }
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
  try { window.speechSynthesis?.cancel(); } catch {}
}

// Internal: play ONE utterance without cancelling prior audio.
// Called by speak() (after stopSpeaking) and by createStreamingSpeech sequentially.
async function playUtterance(text: string, voice?: string): Promise<void> {
  if (!text.trim()) return;
  if (hasApiKey()) {
    try {
      await playOpenAI(text, voice);
      return;
    } catch (e) {
      console.warn('OpenAI TTS failed, falling back to browser voice:', e);
    }
  }
  await playBrowser(text);
}

export async function speak(text: string, voice?: string): Promise<void> {
  stopSpeaking();
  if (!text.trim()) return;
  await playUtterance(text, voice);
}

async function playOpenAI(text: string, voice?: string): Promise<void> {
  const blob = await synthesizeSpeech(text, voice);
  const url = URL.createObjectURL(blob);
  currentUrl = url;
  const audio = new Audio(url);
  currentAudio = audio;
  _speaking = true;

  try {
    await new Promise<void>((resolve, reject) => {
      settleCurrent = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('audio element error'));
      audio.play().catch(reject);
    });
  } finally {
    _speaking = false;
    if (settleCurrent) settleCurrent = null;
    if (currentUrl === url) { URL.revokeObjectURL(url); currentUrl = null; }
    if (currentAudio === audio) currentAudio = null;
  }
}

// Instant, free, local speech for real-time coaching (capture screen).
// Silenced if the main TTS (speak()) is active.
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
  try { window.speechSynthesis?.cancel(); } catch {}
}

// Keep a window-level reference to prevent iOS Safari from GC'ing the utterance.
const _win = window as Window & { _mvUtterance?: SpeechSynthesisUtterance };

function playBrowser(text: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    _win._mvUtterance = u;
    _speaking = true;
    u.onend = () => { _speaking = false; _win._mvUtterance = undefined; resolve(); };
    u.onerror = () => { _speaking = false; _win._mvUtterance = undefined; resolve(); };
    window.speechSynthesis.speak(u);
  });
}

// A2 — streaming speech

// Extract complete sentences (ending with .!?) from the front of text.
// Returns [completeSentences, remainder].
function extractComplete(text: string): [string[], string] {
  const re = /[^.!?]*[.!?]+\s*/g;
  const sentences: string[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const s = match[0].trim();
    if (s) sentences.push(s);
    lastEnd = match.index + match[0].length;
  }
  if (sentences.length === 0) return [[], text];
  return [sentences, text.slice(lastEnd)];
}

export function splitSentences(text: string): string[] {
  const [sentences, remainder] = extractComplete(text);
  const all = [...sentences];
  if (remainder.trim()) all.push(remainder.trim());
  return all;
}

export interface StreamingSpeechHandle {
  push(delta: string): void;
  finish(): Promise<void>;
}

export function createStreamingSpeech(
  voice?: string,
  opts?: { onSpeakingStart?: () => void },
): StreamingSpeechHandle {
  let buffer = '';
  let cancelled = false;
  let firstSpoken = false;
  const queue: string[] = [];
  let draining = false;
  let drainDone: (() => void) | null = null;

  activeStreamCancel = () => { cancelled = true; };

  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length > 0 && !cancelled) {
      const sentence = queue.shift()!;
      if (!firstSpoken) {
        firstSpoken = true;
        opts?.onSpeakingStart?.();
      }
      await playUtterance(sentence, voice);
    }
    draining = false;
    if (drainDone) {
      const cb = drainDone;
      drainDone = null;
      cb();
    }
  }

  function push(delta: string) {
    if (cancelled) return;
    buffer += delta;
    const [sentences, remainder] = extractComplete(buffer);
    if (sentences.length > 0) {
      buffer = remainder;
      queue.push(...sentences);
      drain();
    }
  }

  function finish(): Promise<void> {
    if (buffer.trim()) { queue.push(buffer.trim()); buffer = ''; }
    if (cancelled || (queue.length === 0 && !draining)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      drainDone = resolve;
      drain();
    });
  }

  return { push, finish };
}
