// Login. Remembers the user's email in localStorage so blind users never have
// to type it twice. This screen never speaks — instructions are visible text
// and feedback goes through the role="status" live region, so VoiceOver is the
// only voice here. App TTS is reserved for Conversation Mode.

import { useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { Screen, Title, Heading, Body, PrimaryButton } from '../components';
import { useProfile } from '../state/ProfileContext';
import { earconStart, earconStop } from '../lib/earcon';
import { startRecording, stopRecording, requestMicPermission, getActiveStream } from '../lib/recorder';
import { transcribeAudio } from '../lib/openai';
import { watchForSilence } from '../lib/vad';
import { unlockAudio } from '../lib/audioUnlock';
import { restoreFromCloud } from '../lib/storage';
import { track } from '../lib/telemetry';

type RecState = 'idle' | 'recording' | 'working';

interface GoogleJwt {
  email: string;
  name?: string;
}

const googleAvailable = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function LoginScreen() {
  const { profile, update } = useProfile();
  const [email, setEmail] = useState(profile.email ?? '');
  const [rec, setRec] = useState<RecState>('idle');
  const [showEmail, setShowEmail] = useState(!googleAvailable);
  const [srStatus, setSrStatus] = useState('');

  const announce = (msg: string) => { setSrStatus(msg); };

  const loginWithEmail = async (emailToUse: string, name?: string, method: 'email' | 'google' = 'email') => {
    const trimmed = emailToUse.trim();
    if (!trimmed) {
      announce('Please enter your email address first.');
      return;
    }
    const restored = await restoreFromCloud(trimmed);
    const base = restored ?? { email: trimmed };
    await update(name ? { ...base, name } : base);
    track('auth', 'login', {
      outcome: 'success',
      metadata: { method, cloud_restore_hit: !!restored },
    });
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    try {
      const decoded = jwtDecode<GoogleJwt>(credentialResponse.credential);
      announce(`Welcome, ${decoded.name ?? decoded.email}. Signing you in.`);
      await loginWithEmail(decoded.email, decoded.name, 'google');
    } catch {
      announce('Google sign-in failed. Please enter your email instead.');
      track('auth', 'login', { outcome: 'failure', metadata: { method: 'google' } });
      setShowEmail(true);
    }
  };

  const handleGoogleError = () => {
    announce('Google sign-in failed. Please enter your email instead.');
    track('auth', 'login', { outcome: 'failure', metadata: { method: 'google' } });
    setShowEmail(true);
  };

  const toggleMic = async () => {
    if (rec !== 'idle') return;
    unlockAudio();
    const ok = await requestMicPermission();
    if (!ok) {
      announce('I could not access the microphone. Please type your email address.');
      return;
    }
    try {
      await startRecording();
      earconStart();
      setRec('recording');
    } catch {
      announce('Could not start the microphone. Please type your email address.');
      return;
    }
    const s = getActiveStream();
    if (s) await new Promise<void>((resolve) => { watchForSilence(s, 3000, 20000, resolve); });
    setRec('working');
    earconStop();
    let blob: Blob | null = null;
    try { blob = await stopRecording(); } catch { blob = null; }
    if (!blob) { setRec('idle'); return; }
    try {
      const raw = await transcribeAudio(blob);
      const cleaned = raw
        .trim()
        .toLowerCase()
        .replace(/\s+at\s+/g, '@')
        .replace(/\s+dot\s+/g, '.')
        .replace(/\s/g, '');
      setEmail(cleaned);
      announce(`I heard: ${cleaned}. Tap Login if that is correct, or edit the field to fix it.`);
    } catch {
      announce('Sorry, I had trouble hearing that. Please type your email address.');
    }
    setRec('idle');
  };

  const micLabel =
    rec === 'recording' ? 'Listening...' : rec === 'working' ? 'One moment...' : 'Say your email';

  return (
    <Screen>
      <Title>MenuVoice</Title>
      <Heading>Login</Heading>

      {/* ── Google Sign-In ─────────────────────────────── */}
      {googleAvailable && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            useOneTap={false}
            text="signin_with"
            shape="rectangular"
            size="large"
            width="100%"
          />
          {!showEmail && (
            <button
              className="btn-ghost"
              onClick={() => {
                setShowEmail(true);
                announce('You can now enter your email address manually.');
              }}
              aria-label="Sign in with email instead of Google"
            >
              Use email
            </button>
          )}
        </div>
      )}

      {/* ── Email / mic fallback ───────────────────────── */}
      {showEmail && (
        <>
          <Body>
            {profile.email
              ? `Saved email: ${profile.email}.`
              : 'Say or type your email address, then tap Login.'}
          </Body>

          <PrimaryButton
            label={micLabel}
            hint="Speak your email address"
            onClick={toggleMic}
            disabled={rec === 'working'}
            style={{ minHeight: 96, background: rec === 'recording' ? 'var(--success)' : undefined }}
          />

          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            aria-label="Email address. Type it or speak it"
            autoComplete="email"
            onKeyDown={(e) => { if (e.key === 'Enter') loginWithEmail(email); }}
          />

          <PrimaryButton
            label="Login"
            onClick={() => loginWithEmail(email)}
            hint="Continue with this email"
          />
        </>
      )}
      <p role="status" aria-live="polite" className="body" style={{ minHeight: 24, margin: 0, textAlign: 'center' }}>
        {srStatus}
      </p>
    </Screen>
  );
}
