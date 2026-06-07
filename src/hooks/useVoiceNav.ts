// Reusable voice-navigation hook. Pattern: app speaks a prompt → user taps mic
// → they speak → silence auto-stops recording after ~3 s of quiet → transcript
// matched to one of several commands → handler is called.
// No manual "done" tap required.

import { useCallback, useRef, useState } from 'react';
import { speak, stopSpeaking } from '../lib/speech';
import { startRecording, stopRecording, requestMicPermission, getActiveStream } from '../lib/recorder';
import { transcribeAudio } from '../lib/openai';
import { earconStart, earconStop, earconError } from '../lib/earcon';
import { watchForSilence, SilenceWatcher } from '../lib/vad';

export type VoiceNavPhase = 'announcing' | 'idle' | 'recording' | 'transcribing';

export interface NavCmd {
  id: string;
  keywords: string[];
}

interface Opts {
  commands: NavCmd[];
  onCommand: (id: string, transcript: string) => void | Promise<void>;
  onNoMatch?: (transcript: string) => string | Promise<string>;
  voice?: string;
  silenceMs?: number;
  maxMs?: number;
}

export function useVoiceNav({
  commands,
  onCommand,
  onNoMatch,
  voice,
  silenceMs = 3000,
  maxMs = 30000,
}: Opts) {
  const [phase, setPhase] = useState<VoiceNavPhase>('idle');
  const speakingRef = useRef(false);
  const watcherRef = useRef<SilenceWatcher | null>(null);

  const announce = useCallback(
    async (text: string) => {
      if (speakingRef.current) return;
      speakingRef.current = true;
      setPhase('announcing');
      await speak(text, voice);
      setPhase('idle');
      speakingRef.current = false;
    },
    [voice]
  );

  const listen = useCallback(async () => {
    if (phase !== 'idle') return;
    const ok = await requestMicPermission();
    if (!ok) {
      await announce('I need microphone access. Allow it in your browser settings and try again.');
      return;
    }
    try {
      await startRecording();
      earconStart();
      setPhase('recording');
    } catch {
      earconError();
      await announce('Could not start the microphone. Tap again to retry.');
      return;
    }

    // Auto-stop when the guest goes quiet.
    const s = getActiveStream();
    if (s) {
      await new Promise<void>((resolve) => {
        watcherRef.current = watchForSilence(s, silenceMs, maxMs, () => {
          watcherRef.current = null;
          resolve();
        });
      });
    }
    watcherRef.current = null;

    setPhase('transcribing');
    earconStop();
    let blob: Blob | null = null;
    try { blob = await stopRecording(); } catch { blob = null; }
    if (!blob) { setPhase('idle'); return; }

    let transcript = '';
    try {
      transcript = await transcribeAudio(blob);
    } catch {
      earconError();
      await announce("I couldn't hear that clearly. Tap the mic and try again.");
      return;
    }

    if (!transcript.trim()) {
      earconError();
      await announce("I didn't catch anything. Tap the mic and say it again.");
      return;
    }

    const t = transcript.toLowerCase();
    const matched = commands.find((c) => c.keywords.some((kw) => t.includes(kw.toLowerCase())));

    if (matched) {
      setPhase('idle');
      await onCommand(matched.id, transcript);
    } else if (onNoMatch) {
      earconError();
      const retry = await onNoMatch(transcript);
      await announce(retry);
    } else {
      earconError();
      await announce("I didn't understand that. Say one of the options.");
    }
  }, [phase, announce, commands, onCommand, onNoMatch, silenceMs, maxMs]);

  const stop = useCallback(() => {
    watcherRef.current?.cancel();
    watcherRef.current = null;
    stopSpeaking();
    speakingRef.current = false;
    setPhase('idle');
  }, []);

  // Kept for backward-compat with screens that destructure it, but no longer needed.
  const finish = useCallback(() => {}, []);

  return { phase, announce, listen, finish, stop };
}

/** Pick the best fuzzy match from a list of names given a transcript. */
export function fuzzyPickName(transcript: string, names: string[]): string | null {
  const t = transcript.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;

  for (const name of names) {
    const n = name.toLowerCase();
    if (t.includes(n)) return name;
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const hits = words.filter((w) => w.length > 2 && t.includes(w)).length;
    const score = hits / words.length;
    if (score > bestScore && score >= 0.4) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}
