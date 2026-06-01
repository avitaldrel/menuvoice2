// Home: two large actions and a greeting. Nothing else.

import { Screen, Title, Subtitle, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps } from '../nav';
import { useProfile } from '../state/ProfileContext';

export default function HomeScreen({ navigate }: ScreenProps) {
  const { profile } = useProfile();
  const greeting = profile.name ? `Hello, ${profile.name}.` : 'Hello.';

  return (
    <Screen>
      <div className="col" style={{ marginTop: 24, gap: 8 }}>
        <Title>{greeting}</Title>
        <Subtitle>What would you like to do?</Subtitle>
      </div>

      <div className="col" style={{ marginTop: 32 }}>
        <PrimaryButton
          label="New Restaurant"
          hint="Capture a menu and start a conversation"
          onClick={() => navigate({ name: 'capture' })}
          style={{ minHeight: 96 }}
        />
        <SecondaryButton
          label="My Saved Restaurants"
          hint="Open a menu you captured before"
          onClick={() => navigate({ name: 'saved' })}
          style={{ minHeight: 96 }}
        />
      </div>

      <div className="spacer" />
      <SecondaryButton label="Settings" onClick={() => navigate({ name: 'settings' })} />
    </Screen>
  );
}
