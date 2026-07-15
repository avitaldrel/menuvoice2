// First-use setup asks for typed name and allergy details so safety-critical
// profile data is not silently populated from a transcription mistake. The app
// still speaks each prompt, and screen-reader/device dictation remains available.

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Screen, Title, Body, PrimaryButton, SecondaryButton } from '../components';
import { useProfile } from '../state/ProfileContext';
import { speak, stopSpeaking } from '../lib/speech';
import { cleanName, parseList, normalizeAllergens } from '../util';

type Step = 'name' | 'allergies';

export default function OnboardingScreen() {
  const { update } = useProfile();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [allergiesText, setAllergiesText] = useState('');

  const promptFor = (s: Step): string => {
    switch (s) {
      case 'name':
        return 'Welcome to MenuVoice. What should I call you? Type your first name below.';
      case 'allergies':
        return 'Do you have any food allergies or things you cannot eat? Type them, or type none.';
    }
  };

  const spoken = useRef<Set<Step>>(new Set());
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
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

      {step === 'name' && (
        <TypeStep
          question="What should I call you?"
          help="Type your first name below."
          placeholder="First name"
          value={name}
          onChange={setName}
          onNext={() => setStep('allergies')}
          nextLabel="Next"
          headingRef={stepHeadingRef}
        />
      )}

      {step === 'allergies' && (
        <TypeStep
          question="Any food allergies?"
          help="Type them, or type none."
          placeholder="e.g. shellfish, peanuts"
          value={allergiesText}
          onChange={setAllergiesText}
          onNext={finish}
          nextLabel="Finish"
          onBack={() => setStep('name')}
          headingRef={stepHeadingRef}
        />
      )}
    </Screen>
  );
}

function TypeStep({
  question,
  help,
  placeholder,
  value,
  onChange,
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
  onNext: () => void;
  nextLabel: string;
  onBack?: () => void;
  headingRef?: RefObject<HTMLHeadingElement>;
}) {
  return (
    <div className="col">
      <h2 className="heading" ref={headingRef} tabIndex={-1}>{question}</h2>
      <Body>{help}</Body>

      <input
        className="input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={`${question} Type your answer here`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onNext();
        }}
      />

      <PrimaryButton label={nextLabel} onClick={onNext} />
      {onBack ? <SecondaryButton label="Back" onClick={onBack} /> : null}
    </div>
  );
}
