import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserProfile, EMPTY_PROFILE } from '../types';
import { loadProfile, saveProfile } from '../lib/storage';
import { track } from '../lib/telemetry';
import { setSpeechRate } from '../lib/speech';

// Reflect appearance + speech preferences onto the document and audio engine.
// Theme and text size are data-attributes on <html> that index.css keys off of;
// speech rate feeds the TTS layer. Called on load and after every relevant update.
function applyAppearance(profile: UserProfile) {
  const root = document.documentElement;
  // Freeze transitions across the swap so a theme change is instant and never
  // flashes a mid-transition low-contrast color. Restored on the next frame.
  root.classList.add('theme-swap');
  root.dataset.theme = profile.theme ?? 'light';
  root.dataset.textScale = profile.textScale ?? 'large';
  setSpeechRate(typeof profile.speechRate === 'number' ? profile.speechRate : 1);
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => root.classList.remove('theme-swap'));
  });
}

interface ProfileCtx {
  profile: UserProfile;
  loaded: boolean;
  update: (patch: Partial<UserProfile>) => Promise<void>;
  reset: () => Promise<void>;
}

const Ctx = createContext<ProfileCtx | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadProfile().then((p) => {
      applyAppearance(p);
      setProfile(p);
      setLoaded(true);
    });
  }, []);

  const update = useCallback(
    async (patch: Partial<UserProfile>) => {
      track('profile', 'update', { content: { fields: Object.keys(patch) } });
      setProfile((prev) => {
        const next = { ...prev, ...patch };
        if (
          Object.prototype.hasOwnProperty.call(patch, 'theme') ||
          Object.prototype.hasOwnProperty.call(patch, 'textScale') ||
          Object.prototype.hasOwnProperty.call(patch, 'speechRate')
        ) {
          applyAppearance(next);
        }
        saveProfile(next).catch(() => {});
        return next;
      });
    },
    []
  );

  const reset = useCallback(async () => {
    applyAppearance(EMPTY_PROFILE);
    setProfile({ ...EMPTY_PROFILE });
    await saveProfile({ ...EMPTY_PROFILE });
  }, []);

  return <Ctx.Provider value={{ profile, loaded, update, reset }}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfile must be used inside ProfileProvider');
  return v;
}
