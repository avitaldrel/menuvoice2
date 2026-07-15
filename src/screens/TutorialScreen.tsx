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
    body: 'From the home screen, choose Scan a Menu to read a paper menu with your camera, Find a Menu to search by restaurant name or paste a link, or open one from Saved Restaurants. To explore without a real menu, choose Demo Menu.',
  },
  {
    title: 'Talk with MenuVoice',
    body: 'Once a menu is open you start in Conversation Mode. The microphone is on and MenuVoice talks back. Ask anything, like "What is in the carbonara?" or "What do you recommend without shellfish?" Tap the big button to talk, and tap it again when you are done.',
  },
  {
    title: 'Browse the menu quietly',
    body: 'Switch to Browse Menu to read on your own with your screen reader while MenuVoice stays silent. The menu is grouped into categories like Starters and Mains. Open a category to hear or read only its dishes, so you are not read the whole menu at once.',
  },
  {
    title: 'Allergy alerts',
    body: 'Add your allergies in Settings. Any dish that may contain one of them shows an Allergy alert. MenuVoice reads the dish name, then the warning immediately, before the price and description. Dishes are never hidden, and warnings only appear for allergens you listed. Always confirm with the restaurant, since an alert may be based only on the dish description.',
  },
  {
    title: 'Pause anytime',
    body: 'The Pause Voice button in the corner stops all talking and turns off the microphone at once. Tap Resume Voice to pick up right where you left off. Entering Browse Menu pauses the voice the same way.',
  },
  {
    title: 'Make it comfortable',
    body: 'In Settings under Accessibility you can change the text size, switch the color scheme between Dark, Light, and High contrast, and set the talking speed to Slow, Normal, or Fast. Pick whatever is easiest for you to see and hear.',
  },
];

export default function TutorialScreen({ navigate, goBack }: ScreenProps) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      track('tutorial', 'open', {});
    }
  }, []);

  return (
    <Screen>
      <Title>How MenuVoice works</Title>
      <Body>Six quick steps. Read them with your screen reader, then try the demo menu.</Body>

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
    </Screen>
  );
}
