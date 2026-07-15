import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { ProfileProvider, useProfile } from './state/ProfileContext';
import { PauseProvider, usePause } from './state/PauseContext';
import { Route, Navigate } from './nav';
import { track, setCurrentScreen } from './lib/telemetry';
import {
  createAppHistoryEntry,
  isBackNavigationKey,
  readAppHistoryEntry,
  type AppHistoryEntry,
  type StoredAppHistoryEntry,
} from './lib/appHistory';

import LoginScreen from './screens/LoginScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import HomeScreen from './screens/HomeScreen';
import CaptureScreen from './screens/CaptureScreen';
import ConversationScreen from './screens/ConversationScreen';
import SavedScreen from './screens/SavedScreen';
import SettingsScreen from './screens/SettingsScreen';
import FindScreen from './screens/FindScreen';
import TutorialScreen from './screens/TutorialScreen';

function Root() {
  const { profile, loaded } = useProfile();
  const { paused, status, pause, resume } = usePause();
  const [historyEntry, setHistoryEntry] = useState<AppHistoryEntry>(initializeAppHistory);
  const historyEntryRef = useRef(historyEntry);
  const routesByPositionRef = useRef(new Map<number, Route>([[historyEntry.position, historyEntry.route]]));
  const [pageStatus, setPageStatus] = useState('');
  const prevScreenRef = useRef<string>('');
  const screenEnterRef = useRef<number>(Date.now());

  const showHistoryEntry = useCallback((entry: AppHistoryEntry) => {
    historyEntryRef.current = entry;
    routesByPositionRef.current.set(entry.position, entry.route);
    setHistoryEntry(entry);
  }, []);

  const navigate: Navigate = useCallback((route) => {
    const current = historyEntryRef.current;

    // Returning home has always reset MenuVoice's internal stack. Traverse to
    // the root browser entry too, so a later VoiceOver scrub cannot reopen the
    // completed conversation or capture flow.
    if (route.name === 'home') {
      if (current.position > 0) window.history.go(-current.position);
      return;
    }

    const next = createAppHistoryEntry(route, current.position + 1);
    for (const position of routesByPositionRef.current.keys()) {
      if (position > next.position) routesByPositionRef.current.delete(position);
    }

    pushAppHistoryEntry(next);
    showHistoryEntry(next);
  }, [showHistoryEntry]);

  const goBack = useCallback(() => {
    if (historyEntryRef.current.position > 0) window.history.back();
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const stored = readAppHistoryEntry(event.state);
      if (!stored) return;

      const route = stored.route ?? routesByPositionRef.current.get(stored.position);
      if (!route) return;

      showHistoryEntry({ ...stored, route });
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (!isBackNavigationKey(event) || historyEntryRef.current.position === 0) return;
      event.preventDefault();
      window.history.back();
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showHistoryEntry]);

  useEffect(() => {
    const name = historyEntry.route.name;
    const prev = prevScreenRef.current;
    if (prev && prev !== name) {
      track('nav', 'screen_exit', {
        screen: prev,
        durationMs: Date.now() - screenEnterRef.current,
      });
    }
    setCurrentScreen(name);
    track('nav', 'screen_enter', { screen: name });
    setPageStatus(pageStatusFor(name));
    screenEnterRef.current = Date.now();
    prevScreenRef.current = name;
  }, [historyEntry]);

  if (!loaded) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p className="body" role="status">Loading MenuVoice...</p>
      </div>
    );
  }

  if (!profile.email) return <LoginScreen />;
  if (!profile.onboarded) return <OnboardingScreen />;

  const current = historyEntry.route;
  let screen: ReactNode;
  switch (current.name) {
    case 'home':
      screen = <HomeScreen navigate={navigate} goBack={goBack} />;
      break;
    case 'capture':
      screen = <CaptureScreen navigate={navigate} goBack={goBack} route={current} />;
      break;
    case 'find':
      screen = <FindScreen navigate={navigate} goBack={goBack} />;
      break;
    case 'conversation':
      screen = <ConversationScreen navigate={navigate} goBack={goBack} route={current} />;
      break;
    case 'saved':
      screen = <SavedScreen navigate={navigate} goBack={goBack} />;
      break;
    case 'settings':
      screen = <SettingsScreen navigate={navigate} goBack={goBack} />;
      break;
    case 'tutorial':
      screen = <TutorialScreen navigate={navigate} goBack={goBack} />;
      break;
    default:
      screen = <HomeScreen navigate={navigate} goBack={goBack} />;
  }

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }}
      >
        {[pageStatus, status].filter(Boolean).join(' ')}
      </div>
      <button
        className="btn btn-secondary voice-toggle"
        onClick={() => (paused ? resume() : pause())}
        aria-pressed={paused}
        aria-label={
          paused
            ? 'Resume Voice. Turn the microphone and MenuVoice speech back on.'
            : 'Pause Voice. Stop MenuVoice speech and turn off microphone listening.'
        }
      >
        <span className="voice-toggle__glyph" aria-hidden="true">
          {paused ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l11-6.5-11-6.5z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" />
              <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" />
            </svg>
          )}
        </span>
        {paused ? 'Resume Voice' : 'Pause Voice'}
      </button>
      {screen}
    </>
  );
}

function initializeAppHistory(): AppHistoryEntry {
  const stored = readAppHistoryEntry(window.history.state);
  if (stored?.route) return { ...stored, route: stored.route };

  const initial = createAppHistoryEntry({ name: 'home' }, 0);
  window.history.replaceState(initial, '');
  return initial;
}

function pushAppHistoryEntry(entry: AppHistoryEntry): void {
  try {
    window.history.pushState(entry, '');
  } catch {
    // A very large parsed menu can exceed a browser's history-state quota.
    // Keep the route in memory while still adding the Back target VoiceOver
    // needs. Browser Back/Forward continues to work for the current session.
    const compact: StoredAppHistoryEntry = {
      key: entry.key,
      version: entry.version,
      position: entry.position,
    };
    window.history.pushState(compact, '');
  }
}

function pageStatusFor(name: Route['name']): string {
  switch (name) {
    case 'home': return 'Home screen. Choose scan, find, saved restaurants, demo menu, tutorial, or settings.';
    case 'capture': return 'Capture menu screen. Point the camera at the menu, take photos, then analyze.';
    case 'find': return 'Find menu screen. Enter a restaurant name and city, or paste a menu link.';
    case 'conversation': return 'Conversation screen. MenuVoice can speak with you or let you browse the menu.';
    case 'saved': return 'Saved restaurants screen. Open or delete saved menus.';
    case 'settings': return 'Settings screen. Update profile, allergies, voice, and app preferences.';
    case 'tutorial': return 'Tutorial screen. Learn how to use MenuVoice step by step.';
  }
}

export default function App() {
  return (
    <ProfileProvider>
      <PauseProvider>
        <Root />
      </PauseProvider>
    </ProfileProvider>
  );
}
