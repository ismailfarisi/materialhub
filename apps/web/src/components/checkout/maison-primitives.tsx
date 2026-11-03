"use client";

/**
 * @deprecated Beauty-era "maison" styling. Cart and checkout no longer use it
 * (see `checkout-ui.tsx`); remaining importers are account and support pages.
 * Delete this file once those move to Swatch Book.
 */

import type { ReactNode } from "react";

export const MAISON_SERIF =
  "var(--font-display), 'Inter Tight', system-ui, sans-serif";
export const MAISON_SANS =
  "var(--font-sans), 'Geist', system-ui, sans-serif";

export function Eyebrow({
  children,
  className,
  amber = true,
}: {
  children: ReactNode;
  className?: string;
  amber?: boolean;
}) {
  return (
    <div
      className={`uppercase ${className ?? ""}`}
      style={{
        fontSize: 10,
        letterSpacing: "0.28em",
        color: amber ? "hsl(var(--nl-amber-text))" : "hsl(var(--nl-russet))",
        fontFamily: MAISON_SANS,
      }}
    >
      {children}
    </div>
  );
}

export function SerifTitle({
  children,
  size = 22,
  className,
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        fontFamily: MAISON_SERIF,
        fontSize: size,
        lineHeight: 1.15,
        letterSpacing: "-0.005em",
        fontWeight: 400,
        color: "hsl(var(--nl-cacao))",
      }}
    >
      {children}
    </div>
  );
}

export function MaisonCard({
  title,
  badge,
  cta,
  eyebrowHint,
  children,
}: {
  title: string;
  badge?: ReactNode;
  cta?: ReactNode;
  eyebrowHint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-2.5">
        <div className="flex items-baseline gap-2.5">
          <Eyebrow>{title}</Eyebrow>
          {badge && (
            <span
              style={{
                fontFamily: MAISON_SERIF,
                fontStyle: "italic",
                fontSize: 14,
                color: "hsl(var(--nl-russet))",
              }}
            >
              · {badge}
            </span>
          )}
        </div>
        {cta}
      </div>
      {eyebrowHint && (
        <div
          className="mb-2.5"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 12,
            color: "hsl(var(--nl-amber-text))",
          }}
        >
          {eyebrowHint}
        </div>
      )}
      <div
        style={{
          border: "1px solid rgba(15,18,24,0.08)",
          background: "rgba(15,18,24,0.015)",
          padding: 18,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function MaisonRadio({ selected }: { selected: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: `1px solid ${selected ? "hsl(var(--nl-amber))" : "rgba(15,18,24,0.3)"}`,
        marginTop: 2,
        flexShrink: 0,
      }}
    >
      {selected && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "hsl(var(--nl-amber))",
          }}
        />
      )}
    </span>
  );
}

export function MaisonCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{
        width: 16,
        height: 16,
        border: "1px solid rgba(15,18,24,0.3)",
        background: checked ? "hsl(var(--nl-amber))" : "transparent",
        flexShrink: 0,
      }}
    >
      {checked && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="hsl(var(--nl-espresso))"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <title>Selected</title>
          <path d="M2 6.5 L5 9 L10 3" />
        </svg>
      )}
    </span>
  );
}

export function MaisonTile({
  selected,
  onClick,
  disabled,
  children,
  className,
}: {
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-start transition-all w-full disabled:opacity-40 disabled:cursor-not-allowed ${className ?? ""}`}
      style={{
        border: `1px solid ${selected ? "hsl(var(--nl-amber))" : "rgba(15,18,24,0.16)"}`,
        background: selected ? "rgba(184,115,51,0.06)" : "rgba(255,255,255,0.55)",
      }}
    >
      {children}
    </button>
  );
}

export function MaisonMark({
  size = 11,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: size, height: size, color: "hsl(var(--nl-amber))" }}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <title>MaterialHub UAE mark</title>
      <path d="M 15 4 A 8 8 0 1 0 15 20 A 6 6 0 1 1 15 4 Z" fill="currentColor" />
      <circle cx="20.5" cy="6" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function MaisonStepper({
  steps,
  active,
}: {
  steps: string[];
  active: number;
}) {
  return (
    <div
      className="hidden md:flex items-center"
      style={{
        gap: 18,
        fontSize: 10,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        fontFamily: MAISON_SANS,
      }}
    >
      {steps.map((s, i) => (
        <div key={s} className="flex items-center" style={{ gap: 18 }}>
          <span
            className="flex items-center"
            style={{
              gap: 8,
              color:
                i < active
                  ? "hsl(var(--nl-russet))"
                  : i === active
                    ? "hsl(var(--nl-amber-text))"
                    : "rgba(15,18,24,0.4)",
            }}
          >
            <span
              className="inline-flex items-center justify-center"
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `1px solid ${i === active ? "hsl(var(--nl-amber))" : "rgba(15,18,24,0.3)"}`,
                background: i < active ? "hsl(var(--nl-amber))" : "transparent",
                color: "hsl(var(--nl-espresso))",
                fontSize: 9,
              }}
            >
              {i < active ? (
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <title>Completed</title>
                  <path d="M2 6.5 L5 9 L10 3" />
                </svg>
              ) : (
                <span
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontSize: 10,
                    color: i === active ? "hsl(var(--nl-amber-text))" : "inherit",
                  }}
                >
                  {i + 1}
                </span>
              )}
            </span>
            {s}
          </span>
          {i < steps.length - 1 && (
            <span
              style={{
                width: 36,
                height: 1,
                background: "rgba(15,18,24,0.18)",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
