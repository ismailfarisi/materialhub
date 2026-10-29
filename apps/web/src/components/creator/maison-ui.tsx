"use client";

import { MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * Maison styling for the creator dashboard.
 *
 * The rest of /account is styled inline, page by page (see settings, wallet,
 * orders). The creator dashboard is a dozen files deep with the same handful of
 * controls repeated throughout, so the tokens live here instead of being copied
 * into each tab. Values are the storefront's, not new ones: square corners,
 * amber primary on espresso text, hairline cacao borders, MAISON_SANS for
 * tracked uppercase labels and MAISON_SERIF for titles and figures.
 */

/** Panel / row surface — same hairline box used by wallet and orders rows. */
export const BOX = {
  border: "1px solid rgba(44,24,16,0.10)",
  background: "rgba(44,24,16,0.02)",
} as const;

export const INPUT_CLASS =
  "w-full px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-nl-amber";

export const INPUT_STYLE = {
  border: "1px solid rgba(44,24,16,0.2)",
  background: "rgba(255,255,255,0.55)",
  color: "hsl(var(--nl-cacao))",
  borderRadius: 0,
  fontFamily: MAISON_SANS,
} as const;

export const BUTTON_CLASS =
  "inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const BUTTON_BASE = {
  fontFamily: MAISON_SANS,
  fontSize: 10.5,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  padding: "11px 22px",
  borderRadius: 0,
} as const;

export const PRIMARY_BUTTON = {
  ...BUTTON_BASE,
  background: "hsl(var(--nl-amber))",
  color: "hsl(var(--nl-espresso))",
  border: "1px solid hsl(var(--nl-amber))",
} as const;

export const SECONDARY_BUTTON = {
  ...BUTTON_BASE,
  background: "transparent",
  color: "hsl(var(--nl-cacao))",
  border: "1px solid rgba(44,24,16,0.4)",
} as const;

export const SECONDARY_BUTTON_CLASS = `${BUTTON_CLASS} hover:bg-[rgba(44,24,16,0.04)]`;

/** Text-only action — withdraw, delete, "view history". */
export const QUIET_BUTTON = {
  ...BUTTON_BASE,
  background: "transparent",
  color: "hsl(var(--nl-russet))",
  border: "1px solid transparent",
} as const;

/** Compact variants for controls sitting inside a card row. */
export const SMALL_PRIMARY = { ...PRIMARY_BUTTON, padding: "8px 16px", fontSize: 10 } as const;
export const SMALL_SECONDARY = { ...SECONDARY_BUTTON, padding: "8px 16px", fontSize: 10 } as const;
export const SMALL_QUIET = { ...QUIET_BUTTON, padding: "8px 12px", fontSize: 10 } as const;

export type Tone = "amber" | "success" | "danger" | "muted";

/** Same tinted-outline treatment the order status chips use. */
const TONE: Record<Tone, { border: string; background: string; color: string }> = {
  amber: {
    border: "rgba(184,115,51,0.4)",
    background: "rgba(184,115,51,0.07)",
    color: "hsl(var(--nl-russet))",
  },
  success: {
    border: "rgba(74,103,65,0.35)",
    background: "rgba(74,103,65,0.08)",
    color: "rgb(74,103,65)",
  },
  danger: {
    border: "rgba(140,55,45,0.35)",
    background: "rgba(140,55,45,0.07)",
    color: "rgb(140,55,45)",
  },
  muted: {
    border: "rgba(44,24,16,0.18)",
    background: "rgba(44,24,16,0.04)",
    color: "hsl(var(--nl-russet))",
  },
};

export function Pill({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span
      className="inline-block uppercase whitespace-nowrap"
      style={{
        fontFamily: MAISON_SANS,
        fontSize: 10,
        letterSpacing: "0.18em",
        padding: "3px 8px",
        border: `1px solid ${t.border}`,
        background: t.background,
        color: t.color,
      }}
    >
      {children}
    </span>
  );
}

/** Serif italic placeholder used for every loading/empty state under /account. */
export function Quiet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={className}
      style={{
        fontFamily: MAISON_SERIF,
        fontStyle: "italic",
        fontSize: 15,
        color: "hsl(var(--nl-russet))",
      }}
    >
      {children}
    </p>
  );
}

/** Running text — intros, hints, secondary detail. */
export function Body({
  children,
  className,
  size = 13,
}: {
  children: ReactNode;
  className?: string;
  size?: number;
}) {
  return (
    <p
      className={className}
      style={{
        fontFamily: MAISON_SANS,
        fontSize: size,
        lineHeight: 1.5,
        color: "hsl(var(--nl-russet))",
      }}
    >
      {children}
    </p>
  );
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block uppercase"
      style={{
        fontFamily: MAISON_SANS,
        fontSize: 10,
        letterSpacing: "0.2em",
        color: "hsl(var(--nl-russet))",
      }}
    >
      {children}
    </label>
  );
}

/** Bordered banner for a failure the creator has to read before retrying. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="px-4 py-3"
      style={{
        fontFamily: MAISON_SANS,
        fontSize: 12.5,
        border: `1px solid ${TONE.danger.border}`,
        background: TONE.danger.background,
        color: TONE.danger.color,
      }}
    >
      {children}
    </div>
  );
}

/** One-line result of an action — saved, sent, declined. */
export function StatusLine({ kind, children }: { kind: "ok" | "err"; children: ReactNode }) {
  return (
    <p
      style={{
        fontFamily: MAISON_SANS,
        fontSize: 12.5,
        color: kind === "ok" ? "hsl(140,30%,32%)" : "hsl(0,55%,42%)",
      }}
    >
      {children}
    </p>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="uppercase transition-colors"
      style={{
        fontFamily: MAISON_SANS,
        fontSize: 10,
        letterSpacing: "0.18em",
        padding: "7px 14px",
        borderRadius: 0,
        border: `1px solid ${active ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.2)"}`,
        background: active ? "hsl(var(--nl-amber))" : "transparent",
        color: active ? "hsl(var(--nl-espresso))" : "hsl(var(--nl-russet))",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Centred modal on the linen ground, matching the checkout address drawer:
 * espresso-tinted scrim, square panel, eyebrow + serif title, X to dismiss.
 */
export function MaisonDialog({
  eyebrow,
  title,
  onClose,
  closeLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label={closeLabel}
        className="fixed inset-0 z-40 cursor-default"
        style={{ background: "rgba(26,18,8,0.55)" }}
        onClick={onClose}
      />
      {/* biome-ignore lint/a11y/useSemanticElements: a native <dialog> brings its own backdrop and centring, which fight this scrim + panel layout */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="w-full max-w-md max-h-[85vh] overflow-y-auto pointer-events-auto"
          style={{
            background: "hsl(var(--nl-linen))",
            color: "hsl(var(--nl-cacao))",
            fontFamily: MAISON_SANS,
            boxShadow: "0 24px 60px rgba(26,18,8,0.35)",
          }}
        >
          <div
            className="flex items-start justify-between gap-4"
            style={{
              padding: "20px 22px 16px",
              borderBottom: "1px solid rgba(44,24,16,0.1)",
            }}
          >
            <div>
              <div
                className="uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.28em",
                  color: "hsl(var(--nl-amber-text))",
                }}
              >
                {eyebrow}
              </div>
              <h2
                style={{
                  fontFamily: MAISON_SERIF,
                  fontSize: 24,
                  lineHeight: 1.1,
                  marginTop: 4,
                  fontWeight: 400,
                }}
              >
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="grid place-items-center transition-colors hover:bg-black/5 shrink-0"
              style={{ width: 34, height: 34, color: "hsl(var(--nl-russet))" }}
            >
              <X className="h-4 w-4" strokeWidth={1.25} />
            </button>
          </div>
          <div style={{ padding: "18px 22px 22px" }}>{children}</div>
        </div>
      </div>
    </>
  );
}
