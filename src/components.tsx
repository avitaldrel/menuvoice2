// Shared accessible web UI primitives. Buttons/inputs are >= 64px,
// have roles/labels, and a visible focus ring (see index.css :focus-visible).

import React from 'react';

export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="screen">{children}</div>;
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
}

export function PrimaryButton({ label, onClick, hint, disabled, style }: BtnProps) {
  return (
    <button
      className="btn btn-primary"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-description={hint}
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
}: BtnProps & { tone?: 'default' | 'danger' }) {
  return (
    <button
      className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-secondary'}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-description={hint}
      style={style}
    >
      {label}
    </button>
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
