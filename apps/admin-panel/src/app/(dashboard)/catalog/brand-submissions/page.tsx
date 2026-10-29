"use client";

import {
  type BrandSubmission,
  useApproveBrand,
  useBrandSubmissions,
  useRejectBrand,
} from "@/lib/queries/brands";
import { useState } from "react";

/**
 * Review queue for brands vendors asked to have added to the catalogue.
 *
 * What approving actually changes: the brand row already exists and the vendor
 * who submitted it can already attach products to it. Approval is what puts it
 * on the storefront — brand pages, facets, header nav, the spotlight. So the
 * question here is "does this belong in our catalogue", not "should this vendor
 * be unblocked" — they already are.
 *
 * Rejecting keeps the row rather than deleting it, so products already pointing
 * at it don't lose their brand_id, and the reason is shown back to the vendor
 * in their product form.
 */

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function SubmissionRow({ row, readOnly }: { row: BrandSubmission; readOnly: boolean }) {
  const approve = useApproveBrand();
  const reject = useRejectBrand();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = approve.isPending || reject.isPending;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e as Error).message,
      );
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {row.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.logo_url}
                alt=""
                className="h-8 w-8 rounded object-cover"
              />
            )}
            <p className="font-medium">{row.name}</p>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            /{row.slug}
            {row.submitted_at && ` · submitted ${new Date(row.submitted_at).toLocaleDateString()}`}
            {typeof row.product_count === "number" && ` · ${row.product_count} products`}
          </p>
          {row.website_url && (
            <a
              href={row.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-blue-600 underline"
            >
              {row.website_url}
            </a>
          )}
          {row.description && (
            <p className="mt-1.5 max-w-prose text-sm text-neutral-600">{row.description}</p>
          )}
          {row.rejection_reason && (
            <p className="mt-1.5 text-sm text-red-600">Rejected: {row.rejection_reason}</p>
          )}
        </div>

        {!readOnly && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => approve.mutateAsync(row.id))}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting((v) => !v)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {rejecting && !readOnly && (
        <div className="mt-3 space-y-2">
          <label htmlFor={`reason-${row.id}`} className="block text-xs text-neutral-600">
            Why? The vendor sees this.
          </label>
          <textarea
            id={`reason-${row.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Duplicate of an existing brand / not a real brand / …"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || reason.trim() === ""}
              onClick={() =>
                run(async () => {
                  await reject.mutateAsync({ id: row.id, reason: reason.trim() });
                  setRejecting(false);
                })
              }
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              Confirm rejection
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function BrandSubmissionsPage() {
  const [tab, setTab] = useState<TabKey>("pending");
  const { data, isLoading } = useBrandSubmissions(tab);
  const rows = data?.data ?? [];

  return (
    <div className="p-4">
      <h1 className="mb-1 text-xl font-semibold">Brand submissions</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Brands vendors asked to have added. Approving publishes the brand to the storefront — the
        vendor can already sell against it either way.
      </p>

      <div className="mb-4 flex gap-1 border-b">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === key
                ? "border-neutral-900 font-medium text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {tab === "pending"
            ? "Nothing awaiting review."
            : `No ${tab} submissions.`}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <SubmissionRow key={row.id} row={row} readOnly={tab !== "pending"} />
          ))}
        </div>
      )}
    </div>
  );
}
