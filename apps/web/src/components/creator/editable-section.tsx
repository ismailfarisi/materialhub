"use client";

import { MAISON_SANS } from "@/components/checkout/maison-primitives";
import type { ReactNode } from "react";
import {
  BUTTON_CLASS,
  ErrorNote,
  SECONDARY_BUTTON_CLASS,
  SMALL_PRIMARY,
  SMALL_QUIET,
  SMALL_SECONDARY,
  StatusLine,
} from "./maison-ui";

/**
 * One region of the creator's media kit.
 *
 * The page is the finished kit — the same layout a brand sees in the vendor
 * app — so a section reads as type, not as a form, until the creator clicks
 * Edit. Only the clicked region swaps into inputs; everything else stays
 * readable, which is the point of editing per section rather than flipping the
 * whole page into a form.
 *
 * The parent owns both the draft state and the save call: Cancel has to restore
 * the last saved values, and several sections save through a different endpoint
 * than their neighbours (identity writes the application, the rest write the
 * media kit). This component owns only the chrome.
 */

/** Section heading — small tracked caps over a short rule, as on the brand-facing kit. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2
      className="uppercase"
      style={{
        fontFamily: MAISON_SANS,
        fontSize: 10.5,
        letterSpacing: "0.22em",
        color: "hsl(var(--nl-russet))",
      }}
    >
      {children}
      <span
        className="mt-1.5 block"
        style={{ height: 1, width: 32, background: "hsl(var(--nl-amber))" }}
      />
    </h2>
  );
}

export interface EditableSectionProps {
  title: string;
  /** Right-aligned note beside the heading — "Self-reported", a count, a limit. */
  aside?: ReactNode;
  editing: boolean;
  saving?: boolean;
  error?: string | null;
  /** Shown briefly after a successful save. */
  saved?: boolean;
  savedLabel?: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  /** Read view when `editing` is false, the form when it is true. */
  children: ReactNode;
  /** Label for the edit control — "Edit", "Add", "Manage". */
  editLabel?: string;
  /** Hides the edit control (e.g. nothing to edit until the kit exists). */
  editable?: boolean;
}

export function EditableSection({
  title,
  aside,
  editing,
  saving = false,
  error,
  saved = false,
  savedLabel = "Saved.",
  onEdit,
  onCancel,
  onSave,
  children,
  editLabel = "Edit",
  editable = true,
}: EditableSectionProps) {
  return (
    <section className="space-y-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionLabel>{title}</SectionLabel>
        <div className="flex items-center gap-3">
          {aside && (
            <span
              className="uppercase"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 10,
                letterSpacing: "0.16em",
                color: "hsl(var(--nl-russet))",
                opacity: 0.75,
              }}
            >
              {aside}
            </span>
          )}
          {editable && !editing && (
            <button
              type="button"
              onClick={onEdit}
              className={`${BUTTON_CLASS} hover:bg-[rgba(44,24,16,0.04)]`}
              style={{ ...SMALL_QUIET, padding: "5px 10px" }}
            >
              {editLabel}
            </button>
          )}
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {children}

      {editing && (
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className={BUTTON_CLASS}
            style={SMALL_PRIMARY}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className={SECONDARY_BUTTON_CLASS}
            style={SMALL_SECONDARY}
          >
            Cancel
          </button>
        </div>
      )}

      {!editing && saved && <StatusLine kind="ok">{savedLabel}</StatusLine>}
    </section>
  );
}
