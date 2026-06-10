// Home: three large action buttons, silent on mount.
// VoiceOver reads the buttons — no app TTS, no voice-command mic.

import { Screen, Title, Subtitle, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps } from '../nav';
import { useProfile } from '../state/ProfileContext';

export default function HomeScreen({ navigate }: ScreenProps) {
  const { profile } = useProfile();
  const name = profile.name ? `, ${profile.name}` : '';

  return (
    <Screen>
      <div className="col" style={{ marginTop: 24, gap: 8 }}>
        <Title>Hello{name}.</Title>
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
        <SecondaryButton
          label="Menu from Website"
          hint="Paste a restaurant URL and I will read the menu"
          onClick={() => navigate({ name: 'url' })}
          style={{ minHeight: 72 }}
        />
      </div>

      <div className="spacer" />

      <SecondaryButton
        label="Settings"
        hint="Change your profile, allergies, and voice preferences"
        onClick={() => navigate({ name: 'settings' })}
      />
    </Screen>
  );
}
