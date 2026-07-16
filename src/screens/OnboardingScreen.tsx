// First-use setup — type-only and silent. Voice input on name/allergies was
// unreliable (mishearing, misspelling) for two fields where accuracy matters
// most, so setup goes straight to a typed question, no separate welcome/start
// screen and no mic step. This screen never speaks either: the question text
// is visible and the focused heading gives VoiceOver the prompt. App TTS is
// reserved for Conversation Mode.

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Screen, Title, Body, PrimaryButton, SecondaryButton, AllergenReviewPanel, type AllergenQuestion } from '../components';
import { useProfile } from '../state/ProfileContext';
import { cleanName, parseList, reviewAllergenInput } from '../util';

type Step = 'name' | 'allergies' | 'confirm';

export default function OnboardingScreen() {
  const { update } = useProfile();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [allergiesText, setAllergiesText] = useState('');
  const [questions, setQuestions] = useState<AllergenQuestion[]>([]);
  const acceptedRef = useRef<string[]>([]);

  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Move focus to the new step heading so VoiceOver users land on the question
    // instead of stranding on <body> after the previous button unmounts.
    stepHeadingRef.current?.focus();
  }, [step]);

  const complete = async (allergies: string[]) => {
    // De-dupe case-insensitively, keeping the user's chosen spellings.
    const seen = new Set<string>();
    const final = allergies.filter((a) => {
      const k = a.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await update({ name: cleanName(name), allergies: final, onboarded: true });
  };

  const finish = async () => {
    // NEVER silently rewrite an allergy the user gave us. Suggest spellings and
    // ask; if a word is unrecognized, say so and ask whether to keep it.
    const review = reviewAllergenInput(parseList(allergiesText));
    const qs: AllergenQuestion[] = [
      ...review.corrections.map(([typed, suggested]) => ({ typed, suggested })),
      ...review.unknown.map((typed) => ({ typed })),
    ];
    if (qs.length > 0) {
      acceptedRef.current = review.accepted;
      setQuestions(qs);
      setStep('confirm');
      return;
    }
    await complete(review.accepted);
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

      {step === 'confirm' && (
        <div className="col">
          <h2 className="heading" ref={stepHeadingRef} tabIndex={-1}>
            Checking your allergies
          </h2>
          <Body>Allergies keep you safe, so I never change a word without asking.</Body>
          <AllergenReviewPanel
            questions={questions}
            onDone={(kept) => complete([...acceptedRef.current, ...kept])}
          />
          <SecondaryButton label="Back" onClick={() => setStep('allergies')} />
        </div>
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
