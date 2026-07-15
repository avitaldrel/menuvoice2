// First-use setup — type-only and silent. Voice input on name/allergies was
// unreliable (mishearing, misspelling) for two fields where accuracy matters
// most, so setup goes straight to a typed question, no separate welcome/start
// screen and no mic step. This screen never speaks either: the question text
// is visible and the focused heading gives VoiceOver the prompt. App TTS is
// reserved for Conversation Mode.

import { useEffect, useRef, useState } from 'react';
import { Screen, Title, Body, PrimaryButton, SecondaryButton } from '../components';
import { useProfile } from '../state/ProfileContext';
import { cleanName, parseList, normalizeAllergens } from '../util';

type Step = 'name' | 'allergies';

export default function OnboardingScreen() {
  const { update } = useProfile();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [allergiesText, setAllergiesText] = useState('');

  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Move focus to the new step heading so VoiceOver users land on the question
    // instead of stranding on <body> after the previous button unmounts.
    stepHeadingRef.current?.focus();
  }, [step]);

  const finish = async () => {
    // Correct misheard/misspelled allergens on the way in — safety path.
    const { list: allergies } = normalizeAllergens(parseList(allergiesText));
    await update({ name: cleanName(name), allergies, onboarded: true });
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
  headingRef?: React.RefObject<HTMLHeadingElement>;
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
        autoFocus
      />

      <PrimaryButton label={nextLabel} onClick={onNext} />
      {onBack ? <SecondaryButton label="Back" onClick={onBack} /> : null}
    </div>
  );
}
