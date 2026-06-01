// Settings: hide prices, edit allergies/preferences, choose TTS voice.

import { useState } from 'react';
import { Screen, Title, Body, Heading, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps } from '../nav';
import { useProfile } from '../state/ProfileContext';
import { splitList } from '../util';

const VOICES = ['shimmer', 'nova', 'alloy', 'echo', 'fable', 'onyx'];

export default function SettingsScreen({ goBack }: ScreenProps) {
  const { profile, update } = useProfile();
  const [allergies, setAllergies] = useState(profile.allergies.join(', '));
  const [cuisines, setCuisines] = useState(profile.cuisinesLiked.join(', '));
  const [saved, setSaved] = useState(false);

  const persist = async () => {
    await update({ allergies: splitList(allergies), cuisinesLiked: splitList(cuisines) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Screen>
      <Title>Settings</Title>

      <label className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <span style={{ fontSize: 18 }}>Hide prices</span>
        <input
          type="checkbox"
          checked={profile.hidePrices}
          onChange={(e) => update({ hidePrices: e.target.checked })}
          aria-label="Hide prices"
          style={{ width: 28, height: 28 }}
        />
      </label>

      <Heading>Allergies &amp; restrictions</Heading>
      <Body>Comma separated. I warn you about these before any dish.</Body>
      <input
        className="input"
        type="text"
        value={allergies}
        onChange={(e) => setAllergies(e.target.value)}
        placeholder="e.g. shellfish, peanuts"
        aria-label="Allergies, comma separated"
      />

      <Heading>Foods you love</Heading>
      <input
        className="input"
        type="text"
        value={cuisines}
        onChange={(e) => setCuisines(e.target.value)}
        placeholder="e.g. Thai, spicy, seafood"
        aria-label="Preferred foods, comma separated"
      />

      <Heading>Voice</Heading>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {VOICES.map((v) => {
          const active = profile.ttsVoice === v;
          return (
            <button
              key={v}
              onClick={() => update({ ttsVoice: v })}
              aria-label={`Voice ${v}${active ? ', selected' : ''}`}
              aria-pressed={active}
              style={{
                minHeight: 52,
                padding: '0 16px',
                borderRadius: 'var(--r-md)',
                border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--surface-high)' : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 18,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {v}
            </button>
          );
        })}
      </div>

      <PrimaryButton label={saved ? 'Saved ✓' : 'Save changes'} onClick={persist} />
      <SecondaryButton label="Back" onClick={goBack} />
    </Screen>
  );
}
