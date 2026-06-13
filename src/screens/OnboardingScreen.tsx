// First-use setup — VOICE FIRST. The app speaks each question; the guest answers
// by tapping the mic and speaking (Whisper transcribes). Typing is a fallback,
// not the main path. We only ask name + allergies (allergies = safety). Taste
// preferences are NOT interrogated here — they're learned naturally from what
// the guest decides to order over time (see ConversationScreen + profile).

import React, { useEffect, useRef, useState } from 'react';
import { Screen, Title, Body, PrimaryButton, SecondaryButton } from '../components';
import { useProfile } from '../state/ProfileContext';
import { speak, stopSpeaking } from '../lib/speech';
import { earconStart, earconStop } from '../lib/earcon';
import { startRecording, stopRecording, requestMicPermission, getActiveStream } from '../lib/recorder';
import { watchForSilence } from '../lib/vad';
import { transcribeAudio } from '../lib/openai';
import { cleanName, parseList, normalizeAllergens } from '../util';

type Step = 'intro' | 'name' | 'allergies';

const INTRO =
  'Welcome to MenuVoice. Point your camera at any menu, search a restaurant by name, or paste a link. ' +
  'I will read it aloud and help you decide what to order. ' +
  'Two quick questions to get started.';

export default function OnboardingScreen() {
  const { update } = useProfile();
  const [step, setStep] = useState<Step>('intro');
  const [name, setName] = useState('');
  const [allergiesText, setAllergiesText] = useState('');

  const promptFor = (s: Step): string => {
    switch (s) {
      case 'intro':
        return INTRO;
      case 'name':
        return 'First, what should I call you? Tap the button and say your first name.';
      case 'allergies':
        return 'Do you have any food allergies or things you cannot eat? Tap and say them, or say none.';
    }
  };

  // Only speak interactive steps — intro text is on-screen so VoiceOver reads it.
  // Speaking starts only after the user taps "Let's begin", which is the natural
  // handoff point from VoiceOver navigation to app-driven voice.
  const spoken = useRef<Set<Step>>(new Set());
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'intro') return;
    if (!spoken.current.has(step)) {
      spoken.current.add(step);
      speak(promptFor(step));
    }
    // Move focus to the new step heading so VoiceOver users land on the question
    // instead of stranding on <body> after the previous button unmounts.
    stepHeadingRef.current?.focus();
    return () => stopSpeaking();
  }, [step]);

  const finish = async () => {
    // Correct misheard/misspelled allergens on the way in — safety path.
    const { list: allergies } = normalizeAllergens(parseList(allergiesText));
    await update({ name: cleanName(name), allergies, onboarded: true });
    await speak(
      `Thanks${name.trim() ? ', ' + cleanName(name) : ''}. You're all set. ` +
        (allergies.length
          ? `I'll always warn you about ${allergies.join(' and ')} before describing any dish.`
          : 'You can add allergies any time in Settings.')
    );
  };

  return (
    <Screen>
      <Title>MenuVoice</Title>

      {step === 'intro' && (
        <>
          <Body>{INTRO}</Body>
          <PrimaryButton
            label="Let's begin"
            onClick={() => setStep('name')}
            hint="Starts setup. App will speak from here"
            style={{ minHeight: 96, marginTop: 32 }}
          />
        </>
      )}

      {step === 'name' && (
        <VoiceStep
          question="What should I call you?"
          help="Tap the button and say your first name, or type it below."
          placeholder="First name"
          value={name}
          onChange={setName}
          transform={cleanName}
          onNext={() => setStep('allergies')}
          nextLabel="Next"
          headingRef={stepHeadingRef}
        />
      )}

      {step === 'allergies' && (
        <VoiceStep
          question="Any food allergies?"
          help="Tap and say them (e.g. shellfish and peanuts), or say none. You can also type."
          placeholder="e.g. shellfish, peanuts"
          value={allergiesText}
          onChange={setAllergiesText}
          // keep as a readable string; turned into a list at finish
          transform={(raw) => raw.replace(/\band\b/gi, ',').replace(/[.!]+$/, '').trim()}
          onNext={finish}
          nextLabel="Finish"
          onBack={() => setStep('name')}
          headingRef={stepHeadingRef}
        />
      )}
    </Screen>
  );
}

type RecState = 'idle' | 'recording' | 'working';

function VoiceStep({
  question,
  help,
  placeholder,
  value,
  onChange,
  transform,
  onNext,
  nextLabel,
  onBack,
  headingRef,
}: {
  question: string;
  help: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  transform?: (raw: string) => string;
  onNext: () => void;
  nextLabel: string;
  onBack?: () => void;
  headingRef?: React.RefObject<HTMLHeadingElement>;
}) {
  const [rec, setRec] = useState<RecState>('idle');
  const [srStatus, setSrStatus] = useState('');

  const announce = (msg: string) => { setSrStatus(msg); speak(msg); };

  const toggleMic = async () => {
    if (rec !== 'idle') return;
    const ok = await requestMicPermission();
    if (!ok) {
      announce('I could not access the microphone. You can type your answer instead.');
      return;
    }
    try {
      await startRecording();
      earconStart();
      setRec('recording');
    } catch {
      announce('I could not start the microphone. Please type your answer.');
      return;
    }
    const s = getActiveStream();
    if (s) await new Promise<void>((resolve) => { watchForSilence(s, 3000, 30000, resolve); });
    setRec('working');
    earconStop();
    let blob: Blob | null = null;
    try { blob = await stopRecording(); } catch { blob = null; }
    if (!blob) { setRec('idle'); return; }
    try {
      const raw = await transcribeAudio(blob);
      const v = transform ? transform(raw) : raw.trim();
      onChange(v);
      announce(v ? `I heard: ${v}. Tap ${nextLabel}, or speak again to redo.` : 'I didn\'t catch that. Try again, or type it.');
    } catch {
      announce('Sorry, I had trouble hearing that. Try again, or type your answer.');
    }
    setRec('idle');
  };

  const micLabel = rec === 'recording' ? 'Listening...' : rec === 'working' ? 'One moment...' : 'Tap and speak';

  return (
    <div className="col">
      <h2 className="heading" ref={headingRef} tabIndex={-1}>{question}</h2>
      <Body>{help}</Body>

      <PrimaryButton
        label={micLabel}
        hint="Records your spoken answer"
        onClick={toggleMic}
        disabled={rec !== 'idle'}
        style={{ minHeight: 96, background: rec === 'recording' ? 'var(--success)' : undefined }}
      />

      <input
        className="input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={`${question}. Or type here`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onNext();
        }}
      />

      <PrimaryButton label={nextLabel} onClick={onNext} />
      {onBack ? <SecondaryButton label="Back" onClick={onBack} /> : null}
      <p role="status" aria-live="polite" className="body" style={{ minHeight: 24, margin: 0, textAlign: 'center' }}>
        {srStatus}
      </p>
    </div>
  );
}
