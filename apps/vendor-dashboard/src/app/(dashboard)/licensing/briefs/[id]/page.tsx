"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { formatAED } from "@/lib/queries/creator-content";
import {
  type BriefBid,
  type FundingSource,
  type UpdateBriefInput,
  useAcceptBid,
  useApproveDelivery,
  useCancelBrief,
  useLicensingBalance,
  useRejectDelivery,
  useReviseDelivery,
  useUpdateBrief,
  useVendorBrief,
} from "@/lib/queries/licensing";
import { ReelPreview } from "../_components/ReelPreview";
import { BriefForm } from "../_components/BriefForm";
import { BidsTable } from "../_components/BidsTable";

function BidActions({ briefId, bid }: { briefId: string; bid: BriefBid }) {
  const accept = useAcceptBid();
  const approve = useApproveDelivery();
  const revise = useReviseDelivery();
  const reject = useRejectDelivery();
  const balance = useLicensingBalance();

  const busy = accept.isPending || approve.isPending || revise.isPending || reject.isPending;
  const available = balance.data?.available_fils ?? 0;
  const insufficient = available < Number(bid.amount_fils);

  if (bid.status === "pending") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={busy || insufficient}
          onClick={() =>
            accept.mutate({
              briefId,
              bidId: bid.id,
              funding_source: "payout_balance" as FundingSource,
            })
          }
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          Accept (payout balance)
        </button>
        {insufficient && (
          <span className="text-[11px] text-rose-500">
            Insufficient payout balance ({formatAED(available)})
          </span>
        )}
        <span
          title="Card funding coming soon — use payout balance"
          className="cursor-not-allowed rounded bg-neutral-100 px-2 py-1 text-[11px] text-neutral-400"
        >
          Accept with card (coming soon)
        </span>
      </div>
    );
  }

  if (bid.status === "delivered") {
    return (
      <div className="flex flex-col items-end gap-1">
        {bid.delivered_reel_id && <ReelPreview reelId={bid.delivered_reel_id} />}
        <div className="flex gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => approve.mutate({ briefId, bidId: bid.id })}
            className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const note = prompt("Revision note (optional)") ?? undefined;
              revise.mutate({ briefId, bidId: bid.id, note });
            }}
            className="rounded bg-orange-500 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            Revise
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!confirm("Reject this delivery and reopen the brief?")) return;
              const note = prompt("Rejection note (optional)") ?? undefined;
              reject.mutate({ briefId, bidId: bid.id, note });
            }}
            className="rounded bg-rose-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    );
  }

  if (bid.status === "revision_requested") {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-[11px] text-neutral-500">Awaiting re-delivery</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!confirm("Reject this bid and reopen the brief?")) return;
            const note = prompt("Rejection note (optional)") ?? undefined;
            reject.mutate({ briefId, bidId: bid.id, note });
          }}
          className="rounded bg-rose-600 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    );
  }

  return null;
}

export default function BriefDetailPage() {
  const params = useParams<{ id: string }>();
  const briefId = params.id;
  const detail = useVendorBrief(briefId);
  const update = useUpdateBrief(briefId);
  const cancel = useCancelBrief();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (detail.isLoading) return <div className="p-4 text-sm text-neutral-500">Loading…</div>;
  if (detail.isError || !detail.data) {
    return (
      <div className="p-4">
        <p className="text-sm text-rose-600">Could not load this brief.</p>
        <Link href="/licensing/briefs" className="text-sm text-blue-600 hover:underline">
          ← Back to briefs
        </Link>
      </div>
    );
  }

  const { brief, bids } = detail.data;
  const isOpen = brief.status === "open";

  function handleUpdate(input: UpdateBriefInput) {
    setError(null);
    update.mutate(input, {
      onSuccess: () => setEditing(false),
      onError: (e: unknown) => {
        const err = e as { response?: { data?: { message?: string; error?: string } } };
        setError(err.response?.data?.message ?? err.response?.data?.error ?? "Update failed.");
      },
    });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/licensing/briefs" className="text-sm text-neutral-500 hover:underline">
            ← Briefs
          </Link>
          <h1 className="text-xl font-semibold">{brief.title}</h1>
        </div>
        {isOpen && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded bg-neutral-100 px-3 py-1.5 text-sm"
            >
              {editing ? "Close" : "Edit"}
            </button>
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => {
                if (confirm("Cancel this brief? Open bids will be closed.")) cancel.mutate(briefId);
              }}
              className="rounded bg-rose-50 px-3 py-1.5 text-sm text-rose-700 disabled:opacity-50"
            >
              Cancel brief
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="mb-6">
          <BriefForm
            initial={brief}
            submitting={update.isPending}
            error={error}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-neutral-200 p-4 text-sm">
          <p className="whitespace-pre-wrap text-neutral-700">{brief.brief}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-neutral-500">
            <span>
              Budget guide:{" "}
              {brief.budget_guide_fils ? formatAED(Number(brief.budget_guide_fils)) : "—"}
            </span>
            <span>Bids close: {new Date(brief.bids_close_at).toLocaleString("en-AE")}</span>
            <span>Status: {brief.status}</span>
          </div>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold">Bids</h2>
      <BidsTable bids={bids} renderActions={(bid) => <BidActions briefId={briefId} bid={bid} />} />
    </div>
  );
}
