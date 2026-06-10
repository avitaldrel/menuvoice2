// Unified menu + voice conversation screen.
//
// Layout: phase indicator → latest exchange → controls → semantic MenuDocument.
//
// Voice mode ON (default):
//   App streams TTS sentence-by-sentence; mic auto-opens after each reply.
//   Barge-in ("stop", "wait", etc.) cuts the app off and opens the mic.
//   Turn cues: earconSpeak (app speaking), earconThinking (thinking),
//              earconStart+vibrate (user turn), earconStop+vibrate (heard you).
//
// Voice mode OFF:
//   App is silent; user browses the semantic MenuDocument with VoiceOver.
//   Conversation text is still updated in an aria-live region.

import { useEffect, useRef, useState } from 'react';
import { Screen, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps, Route } from '../nav';
import { ChatTurn, ParsedMenu } from '../types';
import { useProfile } from '../state/ProfileContext';
import { speak, stopSpeaking, createStreamingSpeech } from '../lib/speech';
import {
  SpeechManager,
  isSpeechRecognitionSupported,
  createBargeInListener,
  BargeInListener,
} from '../lib/speechRecognition';
import { buildOpeningLine, chatReplyStream, extractSessionLearnings, hasApiKey } from '../lib/openai';
import {
  earconStart,
  earconStop,
  earconError,
  earconSpeak,
  earconThinkingStart,
  earconThinkingStop,
} from '../lib/earcon';
import { mergeUnique } from '../util';

type Phase = 'speaking' | 'idle' | 'recording' | 'transcribing' | 'thinking' | 'error';

const EXIT_PHRASES = [
  'go home', 'go back', 'exit', 'quit', 'i am done', "i'm done", 'all done', 'finished',
  'end conversation', 'goodbye', 'bye', 'that is all', "that's all",
];

const REPEAT_PHRASES = [
  'repeat that', 'say that again', 'what did you say', 'say it again', 'pardon', 'come again',
];

// Semantic menu document — VoiceOver heading rotor navigates section → item.
function MenuDocument({ menu, restaurantName }: { menu: ParsedMenu; restaurantName: string }) {
  return (
    <section aria-label="Full menu — browse with VoiceOver heading rotor" style={{ marginTop: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{restaurantName}</h1>
      {menu.categories.map((cat) => (
        <section key={cat.name}>
          <h2 className="browse-category">{cat.name}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, marginBottom: 24 }}>
            {cat.items.map((item) => (
              <article key={item.name} className="browse-item">
                <div className="browse-item-header">
                  <h3 className="browse-item-name">{item.name}</h3>
                  {item.price && (
                    <span className="browse-item-price" aria-label={`Price: ${item.price}`}>
                      {item.price}
                    </span>
                  )}
                </div>
                {item.description && <p className="browse-item-desc">{item.description}</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
      {menu.notes && (
        <section>
          <h2 className="browse-category">Notes</h2>
          <p className="body" style={{ marginTop: 8 }}>{menu.notes}</p>
        </section>
      )}
    </section>
  );
}

export default function ConversationScreen({
  navigate,
  route,
}: ScreenProps & { route: Extract<Route, { name: 'conversation' }> }) {
  const { profile, update } = useProfile();
  const { menu, restaurantName } = route;

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [latestUser, setLatestUser] = useState('');
  const [latestAssistant, setLatestAssistant] = useState('');
  const [liveText, setLiveText] = useState('');
  const [phase, setPhase] = useState<Phase>('speaking');
  const [speakMode, setSpeakMode] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const started = useRef(false);
  const speechManagerRef = useRef<SpeechManager | null>(null);
  const processUtteranceRef = useRef<(text: string) => Promise<void>>(async () => {});
  const startMicRef = useRef<() => Promise<void>>(async () => {});
  const speakModeRef = useRef(true);
  speakModeRef.current = speakMode;

  // Barge-in: only while speaking in voice mode.
  useEffect(() => {
    if (phase !== 'speaking' || !speakMode) return;
    const listener: BargeInListener = createBargeInListener(() => {
      stopSpeaking();
      startMicRef.current();
    });
    return () => listener.stop();
  }, [phase, speakMode]);

  // Opening: speak menu overview on first mount.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const base = buildOpeningLine(menu);
      const opening =
        route.source === 'url'
          ? `${base} Just a heads up — this menu is from the website you shared, so it should be their current version, but details may vary.`
          : base;
      setTurns([{ role: 'assistant', text: opening }]);
      setLatestAssistant(opening);
      setPhase('speaking');
      earconSpeak();
      await speak(opening, profile.ttsVoice);
      await startMicRef.current();
    })();
    return () => {
      earconThinkingStop();
      stopSpeaking();
      speechManagerRef.current?.destroy();
      speechManagerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMic = async () => {
    if (!isSpeechRecognitionSupported()) {
      const msg = 'Voice input is not supported in this browser. Try Chrome or Safari.';
      setErrorMsg(msg);
      setPhase('error');
      await speak(msg, profile.ttsVoice);
      return;
    }

    speechManagerRef.current?.destroy();
    speechManagerRef.current = new SpeechManager(
      (userText: string) => {
        earconStop();
        try { navigator.vibrate?.([80]); } catch {}
        processUtteranceRef.current(userText);
      },
      async (msg: string) => {
        earconError();
        try { navigator.vibrate?.([200, 50, 200]); } catch {}
        setErrorMsg(msg);
        setPhase('error');
        await speak(msg, profile.ttsVoice);
      },
    );

    earconStart();
    try { navigator.vibrate?.([30, 40, 30]); } catch {}
    await new Promise<void>((r) => setTimeout(r, 150));
    speechManagerRef.current.start();
    setPhase('recording');
  };
  startMicRef.current = startMic;

  const processUtterance = async (userText: string) => {
    setPhase('transcribing');

    if (!userText.trim()) {
      await sayReply("I didn't catch that. Could you say it again?");
      return;
    }

    const t = userText.toLowerCase().trim();
    const hadExchange = turns.some((x) => x.role === 'user');

    const isExit =
      hadExchange &&
      EXIT_PHRASES.some((p) => t === p || t.startsWith(p + ' ') || t.endsWith(' ' + p));
    if (isExit) {
      await sayReply("Of course. I'll save what we talked about. Goodbye!", undefined, false);
      finish();
      return;
    }

    const isRepeat = REPEAT_PHRASES.some((p) => t.includes(p));
    if (isRepeat) {
      const last = [...turns].reverse().find((x) => x.role === 'assistant');
      if (last) { await sayReply(last.text); return; }
    }

    const history = turns;
    const withUser: ChatTurn[] = [...history, { role: 'user' as const, text: userText }];
    setTurns(withUser);
    setLatestUser(userText);
    setLiveText('');
    setPhase('thinking');
    earconThinkingStart();

    if (speakModeRef.current) {
      const streamer = createStreamingSpeech(profile.ttsVoice, {
        onSpeakingStart: () => {
          earconThinkingStop();
          earconSpeak();
          try { navigator.vibrate?.([50]); } catch {}
          setPhase('speaking');
        },
      });

      let fullReply = '';
      try {
        fullReply = await chatReplyStream(menu, profile, history, userText, (delta) => {
          streamer.push(delta);
          setLiveText((prev) => prev + delta);
        });
        await streamer.finish();
      } catch (e: any) {
        earconThinkingStop();
        earconError();
        try { navigator.vibrate?.([200, 50, 200]); } catch {}
        const msg = e?.message ?? "Something went wrong. Let's try that again.";
        setErrorMsg(msg);
        setPhase('error');
        await speak(msg, profile.ttsVoice);
        return;
      }

      const withReply: ChatTurn[] = [...withUser, { role: 'assistant', text: fullReply }];
      setTurns(withReply);
      setLatestAssistant(fullReply);
      setLiveText('');
      await startMic();
    } else {
      // Silent mode: get reply as text only, no audio.
      let fullReply = '';
      try {
        fullReply = await chatReplyStream(menu, profile, history, userText, (delta) => {
          setLiveText((prev) => prev + delta);
        });
      } catch (e: any) {
        earconThinkingStop();
        earconError();
        const msg = e?.message ?? "Something went wrong. Let's try that again.";
        setErrorMsg(msg);
        setPhase('error');
        return;
      }
      earconThinkingStop();
      const withReply: ChatTurn[] = [...withUser, { role: 'assistant', text: fullReply }];
      setTurns(withReply);
      setLatestAssistant(fullReply);
      setLiveText('');
      setPhase('idle');
    }
  };

  processUtteranceRef.current = processUtterance;

  // Non-streaming reply for errors, repeat, exit phrases.
  const sayReply = async (
    text: string,
    baseTurns?: ChatTurn[],
    listen = speakModeRef.current,
  ) => {
    const base = baseTurns ?? turns;
    const withReply: ChatTurn[] = [...base, { role: 'assistant' as const, text }];
    setTurns(withReply);
    setLatestAssistant(text);
    setPhase('speaking');
    if (speakModeRef.current) {
      earconSpeak();
      try { navigator.vibrate?.([50]); } catch {}
      await speak(text, profile.ttsVoice);
    }
    if (listen && speakModeRef.current) await startMic();
    else setPhase('idle');
  };

  const finish = async () => {
    earconThinkingStop();
    stopSpeaking();
    const hasUser = turns.some((t) => t.role === 'user');
    if (hasUser && hasApiKey()) {
      setSaving(true);
      try {
        const learn = await extractSessionLearnings(turns);
        await update({
          pastOrders: mergeUnique(profile.pastOrders, learn.orders),
          cuisinesLiked: mergeUnique(profile.cuisinesLiked, learn.likes),
          dislikes: mergeUnique(profile.dislikes, learn.dislikes),
        });
      } catch {}
    }
    navigate({ name: 'home' });
  };

  const toggleSpeakMode = () => {
    const next = !speakMode;
    setSpeakMode(next);
    if (!next) stopSpeaking();
  };

  const displayText = liveText || latestAssistant;
  const indicator = indicatorFor(phase);

  return (
    <Screen>
      <h2 className="heading" style={{ marginTop: 4 }}>{restaurantName}</h2>

      <div
        role="status"
        aria-live="polite"
        aria-label={indicator.label}
        className={`phase-indicator phase-${phaseClass(phase)}`}
      >
        <span className="phase-dot" aria-hidden="true" />
        {indicator.label}
      </div>

      {/* Latest exchange — minimal aria-live region */}
      <div
        aria-live="polite"
        aria-relevant="text"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 80,
        }}
      >
        {latestUser && (
          <div
            aria-label={`You said: ${latestUser}`}
            className="turn turn-user"
          >
            <div className="turn-speaker">You</div>
            <div className="turn-text">{latestUser}</div>
          </div>
        )}
        {displayText && (
          <div
            aria-label={`MenuVoice said: ${displayText}`}
            className="turn turn-assistant"
          >
            <div className="turn-speaker">MenuVoice</div>
            <div className="turn-text">{displayText}</div>
          </div>
        )}
      </div>

      {/* Action controls */}
      {phase === 'error' ? (
        <div className="col">
          <p role="alert" className="body" style={{ color: 'var(--danger)', textAlign: 'center' }}>
            {errorMsg}
          </p>
          <PrimaryButton
            label="Try again"
            onClick={() => { setErrorMsg(''); startMic(); }}
          />
        </div>
      ) : phase === 'speaking' ? (
        <div className="col" style={{ gap: 8 }}>
          <div
            aria-hidden="true"
            style={{ height: 8, borderRadius: 4, background: 'var(--surface-high)', overflow: 'hidden' }}
          >
            <div className="speaking-bar" />
          </div>
          <SecondaryButton
            label="Stop speaking"
            hint="Interrupt and speak now"
            onClick={() => { stopSpeaking(); startMicRef.current(); }}
            style={{ minHeight: 70 }}
          />
        </div>
      ) : phase === 'recording' ? (
        <div className="col" style={{ gap: 8 }}>
          <div
            role="status"
            aria-live="polite"
            style={{
              minHeight: 70,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--r-md)',
              border: '2px solid var(--success)',
              background: 'rgba(109, 214, 138, 0.12)',
              color: 'var(--success)',
              fontWeight: 700,
              fontSize: 20,
            }}
          >
            Listening… speak now
          </div>
          <SecondaryButton
            label="Done talking"
            hint="Submit what you just said without waiting"
            onClick={() => speechManagerRef.current?.submitNow()}
            style={{ minHeight: 64 }}
          />
        </div>
      ) : (
        <PrimaryButton
          label={phase === 'idle' ? 'Tap to talk' : 'Please wait…'}
          hint="Start speaking to MenuVoice"
          onClick={() => { if (phase === 'idle') startMic(); }}
          disabled={phase !== 'idle'}
          style={{ minHeight: 110 }}
        />
      )}

      <button
        onClick={toggleSpeakMode}
        aria-pressed={speakMode}
        aria-label={`Voice mode ${speakMode ? 'on' : 'off'}. Tap to turn ${speakMode ? 'off' : 'on'}.`}
        className="btn"
        style={{
          minHeight: 64,
          border: `2px solid ${speakMode ? 'var(--accent)' : 'var(--border)'}`,
          background: speakMode ? 'var(--surface-high)' : 'var(--surface)',
          color: speakMode ? 'var(--accent)' : 'var(--text-secondary)',
        }}
      >
        {speakMode ? 'Voice: ON' : 'Voice: OFF — Browse mode'}
      </button>

      <SecondaryButton
        label={saving ? 'Saving preferences…' : 'Done'}
        hint="Save what you decided and return home"
        onClick={finish}
        disabled={saving}
      />

      {/* Semantic menu — VoiceOver heading rotor: h1 restaurant → h2 category → h3 item */}
      <MenuDocument menu={menu} restaurantName={restaurantName} />
    </Screen>
  );
}

function indicatorFor(phase: Phase): { label: string } {
  switch (phase) {
    case 'speaking':     return { label: 'MenuVoice is speaking…' };
    case 'idle':         return { label: 'Your turn — tap to talk' };
    case 'recording':    return { label: "Listening… I'll respond when you stop talking" };
    case 'transcribing': return { label: 'Hearing you…' };
    case 'thinking':     return { label: 'Thinking…' };
    case 'error':        return { label: 'Something needs your attention' };
  }
}

function phaseClass(phase: Phase): string {
  switch (phase) {
    case 'speaking':     return 'speaking';
    case 'idle':         return 'idle';
    case 'recording':    return 'recording';
    case 'transcribing':
    case 'thinking':     return 'processing';
    case 'error':        return 'error';
  }
}
