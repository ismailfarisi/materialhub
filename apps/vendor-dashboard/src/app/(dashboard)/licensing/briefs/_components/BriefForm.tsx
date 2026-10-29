"use client";

import { useState } from "react";
import type { CreateBriefInput, RightsScope, VendorBrief } from "@/lib/queries/licensing";

const RIGHTS_OPTIONS: Array<{ value: RightsScope; label: string }> = [
  { value: "in_platform", label: "In-platform" },
  { value: "off_platform", label: "Off-platform" },
  { value: "both", label: "In + off-platform" },
];

/** Convert a Date to the value a <input type="datetime-local"> expects (local, no TZ). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface BriefFormProps {
  /** Pre-fill for edit; omit for create. */
  initial?: VendorBrief;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (input: CreateBriefInput) => void;
  onCancel?: () => void;
}

export function BriefForm({ initial, submitting, error, onSubmit, onCancel }: BriefFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [brief, setBrief] = useState(initial?.brief ?? "");
  const [rightsScope, setRightsScope] = useState<RightsScope>(initial?.rights_scope ?? "in_platform");
  const [closeAt, setCloseAt] = useState(toLocalInput(initial?.bids_close_at ?? null));
  const [budgetAed, setBudgetAed] = useState(
    initial?.budget_guide_fils ? String(Number(initial.budget_guide_fils) / 100) : "",
  );
  const [targetCategory, setTargetCategory] = useState(initial?.target_category ?? "");

  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!title.trim()) return setLocalError("Title is required.");
    if (!brief.trim()) return setLocalError("Brief description is required.");
    if (!closeAt) return setLocalError("A bids-close date is required.");
    const closeIso = new Date(closeAt).toISOString();
    if (Number.isNaN(Date.parse(closeIso))) return setLocalError("Invalid close date.");
    const input: CreateBriefInput = {
      title: title.trim(),
      brief: brief.trim(),
      rights_scope: rightsScope,
      bids_close_at: closeIso,
    };
    const aed = Number.parseFloat(budgetAed);
    if (budgetAed && !Number.isNaN(aed) && aed > 0) input.budget_guide_fils = Math.round(aed * 100);
    if (targetCategory.trim()) input.target_category = targetCategory.trim();
    onSubmit(input);
  }

  const shownError = localError ?? error ?? null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1"
          placeholder="e.g. Summer skincare routine reel"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Brief</span>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          className="rounded border border-neutral-300 px-2 py-1"
          placeholder="What should the creator make? Tone, must-haves, dos and don'ts…"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Rights</span>
          <select
            value={rightsScope}
            onChange={(e) => setRightsScope(e.target.value as RightsScope)}
            className="rounded border border-neutral-300 px-2 py-1"
            disabled={!!initial /* rights_scope is fixed after creation */}
          >
            {RIGHTS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Bids close</span>
          <input
            type="datetime-local"
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Budget guide (AED)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={budgetAed}
            onChange={(e) => setBudgetAed(e.target.value)}
            className="w-32 rounded border border-neutral-300 px-2 py-1"
            placeholder="optional"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Target category</span>
          <input
            value={targetCategory}
            onChange={(e) => setTargetCategory(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1"
            placeholder="optional"
          />
        </label>
      </div>

      {shownError && <p className="text-sm text-rose-600">{shownError}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : initial ? "Save changes" : "Create brief"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-neutral-100 px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
