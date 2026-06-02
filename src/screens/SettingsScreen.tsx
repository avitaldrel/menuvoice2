// Settings: hide prices, edit allergies/preferences, choose TTS voice.
// Voice: on mount, speaks current settings summary. Supports voice commands to
// toggle prices, change voice, clear allergies, save, and go back.

import { useEffect, useState } from 'react';
import { Screen, Title, Body, Heading, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps } from '../nav';
import { useProfile } from '../state/ProfileContext';
import { splitList } from '../util';
import { useVoiceNav } from '../hooks/useVoiceNav';

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

  const { phase, announce, listen, finish } = useVoiceNav({
    voice: profile.ttsVoice,
    commands: [
      { id: 'prices_on',  keywords: ['hide prices', 'hide the price', 'turn on hide', 'prices off', 'price off'] },
      { id: 'prices_off', keywords: ['show prices', 'show the price', 'turn off hide', 'prices on', 'price on', 'display price'] },
      { id: 'voice',      keywords: ['change voice', 'switch voice', 'voice to', 'use voice', 'voice shimmer', 'voice nova', 'voice alloy', 'voice echo', 'voice fable', 'voice onyx', 'shimmer', 'nova', 'alloy', 'echo', 'fable', 'onyx'] },
      { id: 'save',       keywords: ['save', 'done', 'confirm', 'apply'] },
      { id: 'back',       keywords: ['back', 'go back', 'close', 'cancel', 'home', 'exit'] },
    ],
    onCommand: async (id, transcript) => {
      if (id === 'prices_on') {
        await update({ hidePrices: true });
        await announce('Prices are now hidden. Say "show prices" to undo, or say "save" to save other changes.');
        return;
      }
      if (id === 'prices_off') {
        await update({ hidePrices: false });
        await announce('Prices will now be shown. Say "save" to save other changes, or "back" to go back.');
        return;
      }
      if (id === 'voice') {
        const t = transcript.toLowerCase();
        const picked = VOICES.find((v) => t.includes(v));
        if (picked) {
          await update({ ttsVoice: picked });
          await announce(`Voice changed to ${picked}. How does this sound? Say "save" to keep it or "back" to return.`);
        } else {
          await announce(`Available voices are: ${VOICES.join(', ')}. Say "change voice to" followed by a name.`);
        }
        return;
      }
      if (id === 'save') {
        await persist();
        await announce('Changes saved. Say "back" to return home, or make more changes.');
        return;
      }
      if (id === 'back') {
        goBack();
        return;
      }
    },
    onNoMatch: async () => {
      return (
        `Here are your voice commands: say "hide prices" or "show prices", ` +
        `"change voice to" followed by ${VOICES.join(', ')}, ` +
        `"save" to save changes, or "back" to go back.`
      );
    },
  });

  useEffect(() => {
    const priceState = profile.hidePrices ? 'hidden' : 'shown';
    announce(
      `Settings. Prices are currently ${priceState}. ` +
        `Voice is ${profile.ttsVoice}. ` +
        `Say "hide prices", "show prices", "change voice to nova" (or another voice name), ` +
        `"save", or "back".`
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
      <Title>Settings</Title>

      <label
        className="card"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
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
      <Body style={{ fontSize: 15, marginTop: -4 }}>
        Say "change voice to [name]" or tap one below.
      </Body>
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

      {/* Voice command mic */}
      <PrimaryButton
        label={micLabel}
        hint="Speak a settings command"
        onClick={phase === 'recording' ? finish : listen}
        disabled={busy}
        style={{
          minHeight: 80,
          background: phase === 'recording' ? 'var(--success)' : undefined,
        }}
      />

      <PrimaryButton label={saved ? 'Saved ✓' : 'Save changes'} onClick={persist} />
      <SecondaryButton label="Back" onClick={goBack} />
    </Screen>
  );
}
