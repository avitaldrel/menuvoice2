// Web Speech API wrapper for the conversation listen loop.
//
// Uses the browser's native voice recognition (webkitSpeechRecognition on iOS Safari)
// instead of MediaRecorder + Web Audio VAD. The native implementation has:
// - Built-in silence detection (2s timer submits the transcript automatically)
// - Reliable on iOS Safari (webkitSpeechRecognition works; Web Audio VAD does not)
// - Auto-restart when iOS cuts the session short mid-session

// Minimal types for Web Speech API — not in all TypeScript DOM lib versions.
interface SR {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
}
interface SRResult { transcript: string; confidence: number; }
interface SRResultList { length: number; [index: number]: { isFinal: boolean; [alt: number]: SRResult; length: number; }; }
interface SREvent extends Event { results: SRResultList; resultIndex: number; }
interface SRErrorEvent extends Event { error: string; message: string; }

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

export class SpeechManager {
  private recognition: SR | null = null;
  private shouldRestart = false;
  private lastTranscript = '';
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SILENCE_MS = 2000;

  constructor(
    private onTranscript: (transcript: string) => void,
    private onError: (message: string) => void,
  ) {
    if (!isSpeechRecognitionSupported()) return;
    const Ctor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    this.recognition = new Ctor();
    this.recognition!.continuous = true;
    this.recognition!.interimResults = true;
    this.recognition!.lang = 'en-US';
    this.recognition!.maxAlternatives = 1;
    this.attach();
  }

  private clearSilenceTimer() {
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private attach() {
    if (!this.recognition) return;

    this.recognition.onresult = (event: SREvent) => {
      const result = event.results[event.results.length - 1];
      const t = result[0].transcript;
      if (result.isFinal || t.length > 0) {
        this.lastTranscript = t;
        this.clearSilenceTimer();
        this.silenceTimer = setTimeout(() => {
          this.silenceTimer = null;
          const transcript = this.lastTranscript;
          this.lastTranscript = '';
          this.shouldRestart = false;
          this.recognition?.stop();
          this.onTranscript(transcript);
        }, SpeechManager.SILENCE_MS);
      }
    };

    this.recognition.onerror = (event: SRErrorEvent) => {
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        this.clearSilenceTimer();
        this.shouldRestart = false;
        this.onError(
          'I need microphone access to hear you. Please allow microphone access, then tap Try again.',
        );
      }
    };

    this.recognition.onend = () => {
      if (this.silenceTimer) {
        this.clearSilenceTimer();
        const t = this.lastTranscript;
        if (t) {
          this.lastTranscript = '';
          this.shouldRestart = false;
          this.onTranscript(t);
          return;
        }
      }

      if (this.shouldRestart) {
        this.restartTimeout = setTimeout(() => {
          try { this.recognition?.start(); } catch {}
        }, 300);
      }
    };
  }

  start() {
    this.shouldRestart = true;
    this.lastTranscript = '';
    try { this.recognition?.start(); } catch {}
  }

  stop() {
    this.shouldRestart = false;
    this.clearSilenceTimer();
    if (this.restartTimeout !== null) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    this.recognition?.stop();
  }

  submitNow() {
    this.clearSilenceTimer();
    const t = this.lastTranscript;
    this.lastTranscript = '';
    this.shouldRestart = false;
    this.recognition?.stop();
    if (t) this.onTranscript(t);
  }

  destroy() {
    this.shouldRestart = false;
    this.clearSilenceTimer();
    if (this.restartTimeout !== null) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    this.recognition?.abort();
    this.recognition = null;
  }
}

// A4 — barge-in listener

const BARGE_IN_HOTWORDS = ['stop', 'wait', 'hold on', 'pause', 'stop talking', 'quiet', 'shh', 'enough'];

export interface BargeInListener {
  stop(): void;
}

// Continuous, always-on recognition that fires only on a short hotword (≤3 words).
// Ignores the first 600ms after creation to guard against self-trigger on app TTS.
export function createBargeInListener(onHotword: () => void): BargeInListener {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return { stop: () => {} };

  const rec: SR = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.maxAlternatives = 1;

  let active = true;
  let startTime = Date.now();

  rec.onresult = (event: SREvent) => {
    if (Date.now() - startTime < 600) return;
    const result = event.results[event.results.length - 1];
    const transcript = result[0].transcript.trim().toLowerCase();
    const words = transcript.split(/\s+/).filter(Boolean);
    if (words.length > 3) return;
    const hit = BARGE_IN_HOTWORDS.some(
      (hw) => transcript === hw || transcript.startsWith(hw + ' ') || transcript.endsWith(' ' + hw),
    );
    if (hit) onHotword();
  };

  rec.onerror = () => {};

  rec.onend = () => {
    if (active) {
      startTime = Date.now();
      setTimeout(() => {
        if (active) try { rec.start(); } catch {}
      }, 300);
    }
  };

  try { rec.start(); } catch {}

  return {
    stop() {
      active = false;
      try { rec.abort(); } catch {}
    },
  };
}
