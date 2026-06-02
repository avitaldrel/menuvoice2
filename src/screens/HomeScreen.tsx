// Home: greeting + two large actions + voice command support.
// On mount the app speaks a short prompt; the user can then either tap a button
// or tap the mic and say "new restaurant", "saved", or "settings".

import { useEffect } from 'react';
import { Screen, Title, Subtitle, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps } from '../nav';
import { useProfile } from '../state/ProfileContext';
import { useVoiceNav } from '../hooks/useVoiceNav';

export default function HomeScreen({ navigate }: ScreenProps) {
  const { profile } = useProfile();
  const name = profile.name ? `, ${profile.name}` : '';

  const { phase, announce, listen, finish } = useVoiceNav({
    voice: profile.ttsVoice,
    commands: [
      { id: 'new',      keywords: ['new', 'scan', 'capture', 'restaurant', 'start', 'menu'] },
      { id: 'saved',    keywords: ['saved', 'previous', 'history', 'old', 'my restaurants'] },
      { id: 'settings', keywords: ['settings', 'setting', 'preferences', 'change', 'voice', 'allerg'] },
    ],
    onCommand: async (id) => {
      if (id === 'new')      navigate({ name: 'capture' });
      else if (id === 'saved')    navigate({ name: 'saved' });
      else if (id === 'settings') navigate({ name: 'settings' });
    },
    onNoMatch: () =>
      'Say "new restaurant" to scan a menu, "saved" to open a saved one, or "settings".',
  });

  useEffect(() => {
    announce(
      `Hello${name}. Say "new restaurant" to scan a menu, "saved" for a saved one, or "settings".`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = phase === 'announcing' || phase === 'transcribing';
  const micLabel =
    phase === 'recording'    ? '■  Done speaking' :
    phase === 'transcribing' ? 'Hearing you…'     :
    phase === 'announcing'   ? 'Please wait…'     :
                               '🎤  Tap to speak a command';

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
      </div>

      <div className="spacer" />

      {/* Voice command button */}
      <PrimaryButton
        label={micLabel}
        hint="Speak a navigation command"
        onClick={phase === 'recording' ? finish : listen}
        disabled={busy}
        style={{
          minHeight: 80,
          background: phase === 'recording' ? 'var(--success)' : undefined,
        }}
      />

      <SecondaryButton label="Settings" onClick={() => navigate({ name: 'settings' })} />
    </Screen>
  );
}
