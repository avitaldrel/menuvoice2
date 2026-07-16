// In-app tutorial. A genuine ordered sequence (numbered steps are meaningful
// here, not decorative), each step a heading so a screen-reader user can jump
// step to step with the rotor. App TTS stays reserved for Conversation Mode;
// elsewhere VoiceOver reads the semantic headings and text.

import { useEffect, useRef } from 'react';
import { Screen, Title, Body, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps } from '../nav';
import { track } from '../lib/telemetry';

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: 'Get a menu',
    body: 'Scan a paper menu with your camera, search for one online, or open a saved menu. Demo Menu is for practice.',
  },
  {
    title: 'Talk with MenuVoice',
    body: 'When a menu opens, the mic is on. Ask anything, like "What is in the carbonara?" Tap the big button to talk.',
  },
  {
    title: 'Browse quietly',
    body: 'Browse Menu is silent. Read category by category with your screen reader.',
  },
  {
    title: 'Allergy alerts',
    body: 'Add allergies in Settings. Risky dishes get an alert, read first. Nothing is hidden. Always confirm with staff.',
  },
  {
    title: 'Pause anytime',
    body: 'Pause Voice stops all talking and listening. Resume Voice picks up where you left off.',
  },
  {
    title: 'Make it comfortable',
    body: 'Set text size, color scheme, and talking speed in Settings.',
  },
];

export default function TutorialScreen({
  navigate,
  goBack,
  firstRun,
}: ScreenProps & { firstRun?: boolean }) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      track('tutorial', 'open', { metadata: { firstRun: !!firstRun } });
    }
  }, [firstRun]);

  return (
    <Screen>
      <Title>{firstRun ? 'Welcome to MenuVoice' : 'How MenuVoice works'}</Title>
      <Body>Six quick steps.</Body>

      <ol className="tutorial-list">
        {STEPS.map((step, i) => (
          <li key={step.title} className="tutorial-step">
            <span className="tutorial-step__num" aria-hidden="true">{i + 1}</span>
            <div className="tutorial-step__body">
              <h2 className="tutorial-step__title">{step.title}</h2>
              <p className="tutorial-step__text">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {firstRun ? (
        <>
          <PrimaryButton
            label="Get started"
            hint="Go to the home screen"
            onClick={goBack}
          />
          <SecondaryButton
            label="Try the Demo Menu"
            hint="Open a sample menu to practice, no camera needed"
            onClick={() => {
              import('../lib/demoMenu').then(({ DEMO_MENU, DEMO_RESTAURANT_NAME }) => {
                navigate({ name: 'conversation', menu: DEMO_MENU, restaurantName: DEMO_RESTAURANT_NAME, source: 'photo' });
              });
            }}
          />
        </>
      ) : (
        <>
          <PrimaryButton
            label="Try the Demo Menu"
            hint="Open a sample menu to practice, no camera needed"
            onClick={() => {
              import('../lib/demoMenu').then(({ DEMO_MENU, DEMO_RESTAURANT_NAME }) => {
                navigate({ name: 'conversation', menu: DEMO_MENU, restaurantName: DEMO_RESTAURANT_NAME, source: 'photo' });
              });
            }}
          />
          <SecondaryButton label="Back" hint="Return to the previous screen" onClick={goBack} />
        </>
      )}
    </Screen>
  );
}
