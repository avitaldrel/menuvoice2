// Reusable voice-navigation hook used by screens that aren't the main conversation.
// Pattern: app speaks a prompt → user taps mic → speech is transcribed → matched to
// one of several commands → handler is called.
//
// The hook never auto-starts listening (the user always initiates with a tap).
// Screens call announce() on mount (or after async data loads) to speak the prompt.

import { useCallback, useRef, useState } from 'react';
import { speak, stopSpeaking } from '../lib/speech';
import { startRecording, stopRecording, requestMicPermission } from '../lib/recorder';
import { transcribeAudio } from '../lib/openai';

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
}

export function useVoiceNav({ commands, onCommand, onNoMatch, voice }: Opts) {
  const [phase, setPhase] = useState<VoiceNavPhase>('idle');
  const speakingRef = useRef(false);

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
      setPhase('recording');
    } catch {
      await announce('Could not start the microphone. Tap again to retry.');
    }
  }, [phase, announce]);

  const finish = useCallback(async () => {
    if (phase !== 'recording') return;
    setPhase('transcribing');

    let blob: Blob | null = null;
    try {
      blob = await stopRecording();
    } catch {
      blob = null;
    }
    if (!blob) {
      setPhase('idle');
      return;
    }

    let transcript = '';
    try {
      transcript = await transcribeAudio(blob);
    } catch {
      await announce("I couldn't hear that clearly. Tap the mic and try again.");
      return;
    }

    if (!transcript.trim()) {
      await announce("I didn't catch anything. Tap the mic and say it again.");
      return;
    }

    const t = transcript.toLowerCase();
    const matched = commands.find((c) => c.keywords.some((kw) => t.includes(kw.toLowerCase())));

    if (matched) {
      setPhase('idle');
      await onCommand(matched.id, transcript);
    } else if (onNoMatch) {
      const retry = await onNoMatch(transcript);
      await announce(retry);
    } else {
      await announce("I didn't understand that. Say one of the options.");
    }
  }, [phase, commands, onCommand, onNoMatch, announce]);

  const stop = useCallback(() => {
    stopSpeaking();
    speakingRef.current = false;
    setPhase('idle');
  }, []);

  return { phase, announce, listen, finish, stop };
}

/** Pick the best fuzzy match from a list of names given a transcript. */
export function fuzzyPickName(transcript: string, names: string[]): string | null {
  const t = transcript.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;

  for (const name of names) {
    const n = name.toLowerCase();
    // Exact containment wins immediately.
    if (t.includes(n)) return name;
    // Word-overlap score.
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
