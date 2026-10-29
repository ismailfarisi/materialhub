"use client";

import { useState } from "react";
import { formatAED } from "@/lib/queries/creator-content";
import {
  type FundingSource,
  type RightsScope,
  useCreateOffer,
  useLicensingBalance,
} from "@/lib/queries/licensing";

// Backend minimum is 5000 fils = AED 50.
const MIN_AED = 50;

const RIGHTS_OPTIONS: Array<{ value: RightsScope; label: string }> = [
  { value: "in_platform", label: "In-platform only" },
  { value: "off_platform", label: "Off-platform only" },
  { value: "both", label: "In-platform + off-platform" },
];

export function OfferModal({
  reelId,
  open,
  onClose,
}: {
  reelId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [amountAed, setAmountAed] = useState("");
  const [rightsScope, setRightsScope] = useState<RightsScope>("in_platform");
  const [fundingSource, setFundingSource] =
    useState<FundingSource>("payout_balance");
  const [message, setMessage] = useState("");

  const balance = useLicensingBalance();
  const createOffer = useCreateOffer();

  if (!open) return null;

  const amountNumber = Number.parseFloat(amountAed);
  const hasValidAmount = Number.isFinite(amountNumber) && amountNumber >= MIN_AED;
  const amountFils = hasValidAmount ? Math.round(amountNumber * 100) : 0;

  const availableFils = balance.data?.available_fils ?? 0;
  const insufficientBalance =
    fundingSource === "payout_balance" && hasValidAmount && amountFils > availableFils;

  const canSubmit = hasValidAmount && !insufficientBalance && !createOffer.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    createOffer.mutate(
      {
        reel_id: reelId,
        amount_fils: amountFils,
        rights_scope: rightsScope,
        funding_source: fundingSource,
        message: message.trim() || undefined,
      },
      {
        onSuccess: () => {
          setAmountAed("");
          setMessage("");
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <form
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-auto rounded-lg bg-white p-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-semibold">Offer to license</h2>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Amount (AED)</span>
          <input
            type="number"
            min={MIN_AED}
            step="0.01"
            value={amountAed}
            onChange={(e) => setAmountAed(e.target.value)}
            placeholder={`Minimum AED ${MIN_AED}`}
            className="rounded border px-2 py-1"
          />
          {amountAed !== "" && !hasValidAmount && (
            <span className="text-xs text-rose-600">
              Minimum offer is AED {MIN_AED}.
            </span>
          )}
        </label>

        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">Rights scope</legend>
          {RIGHTS_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="rights_scope"
                value={opt.value}
                checked={rightsScope === opt.value}
                onChange={() => setRightsScope(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">Funding source</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="funding_source"
              value="payout_balance"
              checked={fundingSource === "payout_balance"}
              onChange={() => setFundingSource("payout_balance")}
            />
            Payout balance
            {balance.data && (
              <span className="text-xs text-neutral-500">
                ({formatAED(availableFils)} available)
              </span>
            )}
          </label>
          <label className="flex items-center gap-2 text-neutral-400">
            <input type="radio" name="funding_source" value="stripe" disabled />
            Card
            <span className="text-xs">(coming soon)</span>
          </label>
          {insufficientBalance && (
            <span className="text-xs text-rose-600">
              Amount exceeds your available payout balance.
            </span>
          )}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Message (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="rounded border px-2 py-1"
            placeholder="Add a note to the creator…"
          />
        </label>

        {createOffer.isError && (
          <p className="text-xs text-rose-600">
            Could not create offer. Please try again.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-neutral-100 px-3 py-1 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {createOffer.isPending ? "Sending…" : "Send offer"}
          </button>
        </div>
      </form>
    </div>
  );
}
