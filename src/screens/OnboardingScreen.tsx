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
import { configuredAppleShortcutUrl, isAppleMobileDevice } from '../lib/appleShortcut';
import { track } from '../lib/telemetry';

type Step = 'name' | 'allergies' | 'confirm' | 'shortcut';

export default function OnboardingScreen() {
  const { update } = useProfile();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [allergiesText, setAllergiesText] = useState('');
  const shortcutUrl = configuredAppleShortcutUrl();
  const shouldOfferShortcut = !!shortcutUrl && isAppleMobileDevice();
  const [questions, setQuestions] = useState<AllergenQuestion[]>([]);
  const acceptedRef = useRef<string[]>([]);

  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Move focus to the new step heading so VoiceOver users land on the question
    // instead of stranding on <body> after the previous button unmounts.
    stepHeadingRef.current?.focus();
  }, [step]);

  const finish = async (shortcutChoice: 'opened' | 'skipped' | 'not_offered') => {
    track('onboarding', 'shortcut_choice', { metadata: { choice: shortcutChoice } });
    await update({
      name: cleanName(name),
      allergies: acceptedRef.current,
      onboarded: true,
    });
  };

  const continueAfterAllergyReview = (allergies: string[]) => {
    const seen = new Set<string>();
    acceptedRef.current = allergies.filter((allergen) => {
      const key = allergen.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (shouldOfferShortcut) {
      setStep('shortcut');
      return;
    }
    void finish('not_offered');
  };

  const finishAllergyStep = () => {
    const review = reviewAllergenInput(parseList(allergiesText));
    const nextQuestions: AllergenQuestion[] = [
      ...review.corrections.map(([typed, suggested]) => ({ typed, suggested })),
      ...review.unknown.map((typed) => ({ typed })),
    ];
    if (nextQuestions.length > 0) {
      acceptedRef.current = review.accepted;
      setQuestions(nextQuestions);
      setStep('confirm');
      return;
    }
    continueAfterAllergyReview(review.accepted);
  };

  return (
    <Screen>
      <Title>Meet My Menu</Title>

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
          onNext={finishAllergyStep}
          nextLabel={shouldOfferShortcut ? 'Next' : 'Finish'}
          onBack={() => setStep('name')}
          headingRef={stepHeadingRef}
        />
      )}

      {step === 'shortcut' && shortcutUrl && (
        <div className="col">
          <h2 className="heading" ref={stepHeadingRef} tabIndex={-1}>Open Meet My Menu with Siri</h2>
          <Body>Create a Shortcut so saying “Siri, launch Meet My Menu” opens this app.</Body>
          <a
            className="btn btn-primary"
            href={shortcutUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
            aria-label="Create Siri Shortcut. Opens Apple's Shortcut page in a new tab"
            onClick={() => void finish('opened')}
          >
            Create Siri Shortcut
          </a>
          <SecondaryButton
            label="Skip for now"
            hint="Continue to Meet My Menu. You can create the Shortcut later in Settings"
            onClick={() => void finish('skipped')}
          />
        </div>
      )}

      {step === 'confirm' && (
        <div className="col">
          <h2 className="heading" ref={stepHeadingRef} tabIndex={-1}>
            Checking your allergies
          </h2>
          <Body>Allergies keep you safe, so I never change a word without asking.</Body>
          <AllergenReviewPanel
            questions={questions}
            onDone={(kept) => continueAfterAllergyReview([...acceptedRef.current, ...kept])}
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
