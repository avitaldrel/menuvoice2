// First-use only. One focused question per step, spoken aloud.

import { useEffect, useRef, useState } from 'react';
import { Screen, Title, Heading, Body, PrimaryButton, SecondaryButton, TextField } from '../components';
import { useProfile } from '../state/ProfileContext';
import { speak, stopSpeaking } from '../lib/speech';
import { splitList } from '../util';

type Step = 'intro' | 'name' | 'allergies' | 'prefs';

const INTRO =
  'Welcome to MenuVoice. I read restaurant menus aloud and talk with you about the food, ' +
  'so you can decide what to order on your own. First, a few quick questions. You can change ' +
  'any of these later in Settings.';

export default function OnboardingScreen() {
  const { update } = useProfile();
  const [step, setStep] = useState<Step>('intro');
  const [name, setName] = useState('');
  const [allergiesText, setAllergiesText] = useState('');
  const [cuisinesText, setCuisinesText] = useState('');

  const promptFor = (s: Step): string => {
    switch (s) {
      case 'intro':
        return INTRO;
      case 'name':
        return 'What is your first name?';
      case 'allergies':
        return 'Do you have any food allergies or dietary restrictions? Separate them with commas, or leave it blank.';
      case 'prefs':
        return 'Last one. What cuisines or foods do you love? This helps me make better suggestions. Optional.';
    }
  };

  const spoken = useRef<Set<Step>>(new Set());
  useEffect(() => {
    if (!spoken.current.has(step)) {
      spoken.current.add(step);
      speak(promptFor(step));
    }
    return () => stopSpeaking();
  }, [step]);

  const finish = async () => {
    const allergies = splitList(allergiesText);
    await update({
      name: name.trim(),
      allergies,
      cuisinesLiked: splitList(cuisinesText),
      onboarded: true,
    });
    await speak(
      `Thanks${name.trim() ? ', ' + name.trim() : ''}. You're all set. ` +
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
          <PrimaryButton label="Let's begin" onClick={() => setStep('name')} hint="Starts the questions" />
        </>
      )}

      {step === 'name' && (
        <div className="col">
          <Heading>What is your first name?</Heading>
          <TextField label="First name" value={name} onChange={setName} placeholder="First name" autoFocus onSubmit={() => setStep('allergies')} />
          <PrimaryButton label="Next" onClick={() => setStep('allergies')} />
        </div>
      )}

      {step === 'allergies' && (
        <div className="col">
          <Heading>Any food allergies or restrictions?</Heading>
          <Body>Separate with commas, e.g. shellfish, peanuts, gluten. Leave blank if none.</Body>
          <TextField label="Allergies" value={allergiesText} onChange={setAllergiesText} placeholder="e.g. shellfish, peanuts" onSubmit={() => setStep('prefs')} />
          <PrimaryButton label="Next" onClick={() => setStep('prefs')} />
          <SecondaryButton label="Back" onClick={() => setStep('name')} />
        </div>
      )}

      {step === 'prefs' && (
        <div className="col">
          <Heading>What foods do you love?</Heading>
          <Body>Optional. e.g. Thai, spicy, seafood.</Body>
          <TextField label="Preferred foods" value={cuisinesText} onChange={setCuisinesText} placeholder="e.g. Thai, spicy, seafood" onSubmit={finish} />
          <PrimaryButton label="Finish" onClick={finish} />
          <SecondaryButton label="Back" onClick={() => setStep('allergies')} />
        </div>
      )}
    </Screen>
  );
}
