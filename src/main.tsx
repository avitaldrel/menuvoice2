import React from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import App from './App';
import { unlockAudio } from './lib/speech';
import { initTelemetry } from './lib/telemetry';

initTelemetry();

// Apply appearance BEFORE first paint so there is no wrong-theme flash.
// Defaults are the warm dark theme and large text; a saved profile overrides
// them. ProfileContext re-applies (and keeps applying) once the profile loads.
try {
  const raw = localStorage.getItem('menuvoice.profile.v1');
  const saved = raw ? JSON.parse(raw) : null;
  document.documentElement.dataset.theme = saved?.theme ?? 'dark';
  document.documentElement.dataset.textScale = saved?.textScale ?? 'large';
} catch {
  document.documentElement.dataset.theme = 'dark';
  document.documentElement.dataset.textScale = 'large';
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// Unlock audio on the very first user gesture, anywhere in the app. iOS/Safari
// (and Chrome's autoplay policy) block all programmatic audio — TTS, earcons,
// SpeechSynthesis — until the first one runs inside a real gesture. Doing it
// once globally means every later timer/callback-driven cue is allowed to play.
function primeAudioOnce() {
  unlockAudio();
  window.removeEventListener('pointerdown', primeAudioOnce);
  window.removeEventListener('touchstart', primeAudioOnce);
  window.removeEventListener('keydown', primeAudioOnce);
}
window.addEventListener('pointerdown', primeAudioOnce, { capture: true });
window.addEventListener('touchstart', primeAudioOnce, { capture: true });
window.addEventListener('keydown', primeAudioOnce, { capture: true });

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
