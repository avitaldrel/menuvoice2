// Shared accessible web UI primitives. Buttons/inputs are >= 64px,
// have roles/labels, and a visible focus ring (see index.css :focus-visible).

import React, { useEffect, useRef, useState } from 'react';

export function Screen({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // Move focus to screen top on every mount so keyboard/SR users land at content
    ref.current?.focus();
  }, []);
  return (
    <main id="main-content" className="screen" tabIndex={-1} ref={ref}>
      {children}
    </main>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="title">{children}</h1>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  return <p className="subtitle">{children}</p>;
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="heading">{children}</h2>;
}

export function Body({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p className="body" style={style}>
      {children}
    </p>
  );
}

interface BtnProps {
  label: string;
  onClick: () => void;
  hint?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export function PrimaryButton({ label, onClick, hint, disabled, style, className }: BtnProps) {
  return (
    <button
      className={`btn btn-primary${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={hint ? `${label}. ${hint}` : label}
      style={style}
    >
      {label}
    </button>
  );
}

export function SecondaryButton({
  label,
  onClick,
  hint,
  disabled,
  tone,
  style,
  className,
}: BtnProps & { tone?: 'default' | 'danger' }) {
  return (
    <button
      className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-secondary'}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={hint ? `${label}. ${hint}` : label}
      style={style}
    >
      {label}
    </button>
  );
}

// ── Allergen review panel ───────────────────────────────────────────────────
// Shown whenever saving allergies would require changing or guessing at what
// the user said. One question per word; nothing is saved until every question
// is answered. This keeps a safety-critical field consensual: the app suggests,
// the user decides.
export interface AllergenQuestion {
  typed: string;
  suggested?: string; // present = spelling suggestion; absent = unrecognized word
}

export function AllergenReviewPanel({
  questions,
  onDone,
}: {
  questions: AllergenQuestion[];
  onDone: (kept: string[]) => void;
}) {
  // undefined = unanswered; null = removed; string = the word to save.
  const [choices, setChoices] = useState<(string | null | undefined)[]>(() =>
    questions.map(() => undefined),
  );

  const decide = (i: number, value: string | null) => {
    setChoices((prev) => {
      const next = [...prev];
      next[i] = value;
      if (next.every((c) => c !== undefined)) {
        onDone(next.filter((c): c is string => typeof c === 'string' && c.length > 0));
      }
      return next;
    });
  };

  return (
    <div className="card" role="group" aria-label="Check your allergy list before saving">
      <p className="body" style={{ fontWeight: 700, marginBottom: 12 }}>
        Before I save your allergy list, please check
        {questions.length === 1 ? ' this word' : ' these words'}:
      </p>
      <div className="col">
        {questions.map((q, i) => {
          const answered = choices[i] !== undefined;
          return (
            <div key={`${q.typed}-${i}`} className="allergen-question">
              {answered ? (
                <p className="body" role="status">
                  {choices[i] === null
                    ? `Removed "${q.typed}".`
                    : `Saved as ${choices[i]}.`}
                </p>
              ) : q.suggested ? (
                <>
                  <p className="body" style={{ marginBottom: 10 }}>
                    You entered <strong>{q.typed}</strong>. Did you mean <strong>{q.suggested}</strong>?
                  </p>
                  <div className="row">
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, minHeight: 56 }}
                      onClick={() => decide(i, q.suggested!)}
                      aria-label={`Yes, save ${q.suggested}`}
                    >
                      Yes, {q.suggested}
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, minHeight: 56 }}
                      onClick={() => decide(i, q.typed)}
                      aria-label={`No, keep ${q.typed} exactly as I entered it`}
                    >
                      Keep "{q.typed}"
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="body" style={{ marginBottom: 10 }}>
                    I don't recognize <strong>{q.typed}</strong> as a food allergen. I can still
                    watch for that exact word on menus.
                  </p>
                  <div className="row">
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, minHeight: 56 }}
                      onClick={() => decide(i, q.typed)}
                      aria-label={`Keep ${q.typed} on my allergy list`}
                    >
                      Keep it
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, minHeight: 56 }}
                      onClick={() => decide(i, null)}
                      aria-label={`Remove ${q.typed} from my allergy list`}
                    >
                      Remove it
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TextField(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <input
      className="input"
      type="text"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      aria-label={props.label}
      autoFocus={props.autoFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && props.onSubmit) props.onSubmit();
      }}
    />
  );
}
