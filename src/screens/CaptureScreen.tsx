// Menu capture (web). Live camera preview with AUTO-SHUTTER + audio coaching,
// plus a manual shutter, multi-photo, library upload, then AI analysis.
//
// Auto mode (default): src/lib/autocapture.ts watches the video for
// brightness + content + steadiness and fires on its own while coaching by
// voice. Manual mode: tap Capture. Both add to the same photo list.
//
// Voice commands (after ≥1 photo captured): "analyze" / "done" → analyze,
// "another" / "more" → capture another, "cancel" / "back" → cancel.

import { useEffect, useRef, useState } from 'react';
import { Screen, Title, Body, PrimaryButton, SecondaryButton } from '../components';
import { ScreenProps } from '../nav';
import { speak, coach, stopCoach } from '../lib/speech';
import { startCamera, stopCamera, captureFrame, fileToBase64 } from '../lib/camera';
import { parseMenuFromImages, hasApiKey } from '../lib/openai';
import { saveRestaurant } from '../lib/storage';
import { AutoCaptureController } from '../lib/autocapture';
import { useVoiceNav } from '../hooks/useVoiceNav';

export default function CaptureScreen({ navigate, goBack }: ScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoRef = useRef<AutoCaptureController | null>(null);
  const analyzingRef = useRef(false);

  const [photos, setPhotos] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('Starting camera…');
  const [camError, setCamError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoMode, setAutoMode] = useState(true);

  // Voice commands available once at least one photo has been captured.
  const photosRef = useRef<string[]>([]);
  const { phase: voicePhase, listen: voiceListen, finish: voiceDone } = useVoiceNav({
    commands: [
      { id: 'analyze', keywords: ['analyze', 'analyse', 'done', 'finish', 'go', 'read', 'process'] },
      { id: 'another', keywords: ['another', 'more', 'next', 'page', 'additional'] },
      { id: 'cancel',  keywords: ['cancel', 'back', 'stop', 'exit', 'never mind', 'nevermind'] },
      { id: 'manual',  keywords: ['capture', 'take', 'photo', 'shoot', 'snap'] },
    ],
    onCommand: async (id) => {
      if (id === 'analyze') { analyze(); }
      else if (id === 'another') { addPhoto(captureFrame(videoRef.current!), false); }
      else if (id === 'manual') { manualCapture(); }
      else if (id === 'cancel') { goBack(); }
    },
    onNoMatch: () =>
      `Say "analyze" to read the menu, "another" for another photo, or "cancel" to go back.`,
  });

  // Start / stop camera.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (videoRef.current) {
          const s = await startCamera(videoRef.current);
          if (cancelled) {
            stopCamera(s);
            return;
          }
          streamRef.current = s;
          setCameraReady(true);
        }
      } catch {
        setCamError(
          'Camera unavailable. On iPhone, open this site over HTTPS and allow camera access. You can still upload photos.'
        );
      }
    })();
    return () => {
      cancelled = true;
      autoRef.current?.stop();
      stopCoach();
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // Run / stop the auto-capture controller based on mode + state.
  useEffect(() => {
    const active = autoMode && cameraReady && !analyzing && !camError;
    if (!active) {
      autoRef.current?.stop();
      stopCoach();
      return;
    }
    if (!autoRef.current) autoRef.current = new AutoCaptureController();
    speak('Auto capture is on. Hold your phone steady over the menu and I will take the photo for you.');
    setStatus('Auto capture on. Hold your phone over the menu.');
    autoRef.current.start(videoRef.current!, {
      onCoach: (msg) => {
        setStatus(msg);
        coach(msg);
      },
      onCapture: () => {
        addPhoto(captureFrame(videoRef.current!), true);
        autoRef.current?.acknowledgeCapture();
      },
      onStruggle: () => {
        // Auto-capture couldn't get a clean, steady shot — fall back to manual.
        setAutoMode(false);
        const msg = 'Auto capture is having trouble. Switching to manual — tap the Capture button when you are ready.';
        setStatus('Switched to manual. Tap "Capture photo" to take the shot.');
        speak(msg);
      },
    });
    return () => {
      autoRef.current?.stop();
      stopCoach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, cameraReady, analyzing, camError]);

  const addPhoto = (b64: string | null, viaAuto: boolean) => {
    if (!b64) {
      if (!viaAuto) announce('That photo did not capture. Try again.');
      return;
    }
    setPhotos((prev) => {
      const next = [...prev, b64];
      photosRef.current = next;
      const msg = `Got it. Photo ${next.length} captured. ${
        viaAuto
          ? 'Move to the next page, or tap Done. You can also say "analyze" or "another".'
          : 'Take another, or tap Done to analyze. You can also say "analyze" or "another".'
      }`;
      setStatus(msg);
      if (viaAuto) coach(`Photo ${next.length} captured. Say analyze or another.`);
      else speak(msg);
      return next;
    });
  };

  const announce = (msg: string) => {
    setStatus(msg);
    speak(msg);
  };

  const manualCapture = () => {
    if (analyzing || !videoRef.current) return;
    addPhoto(captureFrame(videoRef.current), false);
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    const added: string[] = [];
    for (const f of files) {
      try {
        added.push(await fileToBase64(f));
      } catch {}
    }
    if (added.length) {
      setPhotos((prev) => {
        const next = [...prev, ...added];
        announce(`Added ${added.length} photo${added.length > 1 ? 's' : ''}. ${next.length} total.`);
        return next;
      });
    }
    e.target.value = '';
  };

  const analyze = async () => {
    if (photos.length === 0) {
      announce('Capture at least one photo of the menu first.');
      return;
    }
    if (!hasApiKey()) {
      announce('No OpenAI key is set. Add VITE_OPENAI_API_KEY to your .env and restart the dev server.');
      return;
    }
    analyzingRef.current = true;
    setAnalyzing(true);
    autoRef.current?.stop();
    stopCoach();
    announce('Reading the menu. This takes a few seconds.');
    try {
      const menu = await parseMenuFromImages(photos);
      const restaurantName = name.trim() || 'This restaurant';
      await saveRestaurant(restaurantName, menu).catch(() => {});
      stopCamera(streamRef.current);
      navigate({ name: 'conversation', menu, restaurantName });
    } catch (e: any) {
      announce(e?.message ?? 'I could not read the menu. Try retaking the photos with more light.');
      setAnalyzing(false);
      analyzingRef.current = false;
    }
  };

  return (
    <Screen>
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Title>Capture menu</Title>
        <div
          className="card"
          style={{ padding: '8px 16px' }}
          aria-label={`${photos.length} photo${photos.length === 1 ? '' : 's'} captured`}
        >
          <strong style={{ fontSize: 22 }}>{photos.length} 📷</strong>
        </div>
      </div>

      <input
        className="input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Restaurant name (optional)"
        aria-label="Restaurant name, optional"
      />

      <button
        onClick={() => setAutoMode((v) => !v)}
        aria-pressed={autoMode}
        aria-label={`Auto capture ${autoMode ? 'on' : 'off'}. Tap to turn ${autoMode ? 'off' : 'on'}.`}
        className="btn"
        style={{
          minHeight: 56,
          border: `2px solid ${autoMode ? 'var(--accent)' : 'var(--border)'}`,
          background: autoMode ? 'var(--surface-high)' : 'var(--surface)',
          color: autoMode ? 'var(--accent)' : 'var(--text-secondary)',
        }}
      >
        {autoMode ? '⦿ Auto-capture: ON' : '○ Auto-capture: OFF'}
      </button>

      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 4',
          background: '#000',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
          border: `2px solid ${autoMode ? 'var(--accent)' : 'var(--border)'}`,
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Camera viewfinder. Point the back of your phone at the menu."
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {analyzing && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)',
              fontSize: 20,
            }}
          >
            Reading the menu…
          </div>
        )}
      </div>

      {camError ? <Body style={{ color: 'var(--danger)' }}>{camError}</Body> : null}
      <p className="body" aria-live="polite" style={{ textAlign: 'center', minHeight: 28 }}>
        {status}
      </p>

      <div className="col">
        <PrimaryButton
          label={autoMode ? 'Capture now (manual)' : 'Capture photo'}
          hint="Takes a photo of the menu immediately"
          onClick={manualCapture}
          disabled={analyzing || !!camError}
          style={{ minHeight: 80 }}
        />
        <div className="row">
          <SecondaryButton label="Upload from Library" onClick={() => fileRef.current?.click()} disabled={analyzing} />
          <PrimaryButton label={`Done — Analyze (${photos.length})`} onClick={analyze} disabled={analyzing || photos.length === 0} />
        </div>

        {/* Voice commands: only shown once at least one photo is captured */}
        {photos.length > 0 && !analyzing && (
          <PrimaryButton
            label={
              voicePhase === 'recording'    ? '■  Done speaking' :
              voicePhase === 'transcribing' ? 'Hearing you…'     :
              voicePhase === 'announcing'   ? 'Please wait…'     :
                                              '🎤  Say "analyze", "another", or "cancel"'
            }
            hint="Voice command: analyze, another photo, or cancel"
            onClick={voicePhase === 'recording' ? voiceDone : voiceListen}
            disabled={voicePhase === 'transcribing' || voicePhase === 'announcing'}
            style={{
              minHeight: 70,
              background: voicePhase === 'recording' ? 'var(--success)' : 'var(--surface-high)',
              color: 'var(--text-primary)',
              border: '2px solid var(--border)',
              fontSize: 16,
            }}
          />
        )}

        <SecondaryButton label="Cancel" onClick={goBack} disabled={analyzing} />
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPickFiles} />
    </Screen>
  );
}
