"use client";

import {
  type EcoDeclaration,
  type EcoDeclarationStatus,
  fetchCertificateUrl,
  useApproveEcoDeclaration,
  useEcoDeclarations,
  useRejectEcoDeclaration,
} from "@/lib/queries/eco-declarations";
import { AlertTriangle, ChevronDown, ExternalLink, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { reviewWarnings } from "./review-warnings";

/**
 * Review queue for vendors' "plastic-ban ready" declarations (eco catalogue).
 *
 * What approving changes: the product gets the "plastic-ban ready" badge on the
 * storefront and appears under the plastic-ban ready filter and collection.
 * The storefront says the supplier declared it and MaterialHub reviewed the
 * declaration; approval is a listing check against the vendor's own data and
 * evidence, not a legal certification. Rejecting keeps the row and shows the
 * reason to the vendor on their product form; they can edit and resubmit.
 */

const TABS: Array<{ key: EcoDeclarationStatus | "all"; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "withdrawn", label: "Withdrawn" },
  { key: "all", label: "All" },
];

const PAGE_SIZE = 20;

const STATUS_STYLE: Record<EcoDeclarationStatus, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-green-50 text-green-800 ring-green-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  withdrawn: "bg-neutral-100 text-neutral-600 ring-neutral-200",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function errorMessage(e: unknown): string {
  return (
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (e as Error).message ??
    "Something went wrong"
  );
}

function StatusBadge({ status }: { status: EcoDeclarationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

function DeclarationRow({
  row,
  open,
  onToggle,
  onDone,
}: {
  row: EcoDeclaration;
  open: boolean;
  onToggle: () => void;
  onDone: (message: string) => void;
}) {
  const approve = useApproveEcoDeclaration();
  const reject = useRejectEcoDeclaration();
  const [rejecting, setRejecting] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const busy = approve.isPending || reject.isPending;
  const reviewable =
    row.status === "pending" || row.status === "rejected" || row.status === "approved";
  const warnings = reviewWarnings(row);
  const productName = row.product?.name ?? "Deleted product";
  const reasonOk = reason.trim().length >= 5;

  async function run(fn: () => Promise<unknown>, message: string) {
    setError(null);
    try {
      await fn();
      setRejecting(false);
      setConfirmingApprove(false);
      setReason("");
      onDone(message);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function openCertificate() {
    setError(null);
    setOpening(true);
    // Open synchronously so pop-up blockers allow it, then point it at the signed URL.
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    try {
      const url = await fetchCertificateUrl(row.id);
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      win?.close();
      setError(errorMessage(e));
    } finally {
      setOpening(false);
    }
  }

  const detailId = `eco-detail-${row.id}`;

  return (
    <li className="rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={detailId}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-900"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-neutral-900">{productName}</p>
            <StatusBadge status={row.status} />
            {warnings.length > 0 && row.status === "pending" && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle size={14} aria-hidden />
                {warnings.length === 1 ? "1 thing to check" : `${warnings.length} things to check`}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {row.vendor?.name ?? "Unknown supplier"}
            {row.product?.category_name && ` · ${row.product.category_name}`}
            {row.product?.sku && (
              <>
                {" · "}
                <span className="font-mono">{row.product.sku}</span>
              </>
            )}
            {` · submitted ${formatDate(row.submitted_at)}`}
          </p>
        </div>
        <ChevronDown
          size={18}
          aria-hidden
          className={`mt-1 shrink-0 text-neutral-400 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div id={detailId} className="space-y-4 border-t border-neutral-200 p-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Supplier's statement
              </h3>
              <p className="mt-1 max-w-prose whitespace-pre-line text-sm text-neutral-800">
                {row.statement || "No statement given."}
              </p>

              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Certificate
              </h3>
              {row.has_certificate ? (
                <button
                  type="button"
                  onClick={openCertificate}
                  disabled={opening}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-40"
                >
                  <FileText size={16} aria-hidden />
                  {row.certificate_filename ?? "Open certificate"}
                  <ExternalLink size={14} aria-hidden className="text-neutral-400" />
                </button>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">None attached (optional).</p>
              )}

              {row.product && (
                <p className="mt-4 text-xs text-neutral-500">
                  Listing status: <span className="text-neutral-800">{row.product.status}</span>
                  {" · "}
                  <a
                    href={`/catalog/products/${row.product.id}`}
                    className="text-blue-600 underline underline-offset-2"
                  >
                    Open product
                  </a>
                </p>
              )}
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Compliance attributes on the listing
              </h3>
              {row.eco_attributes.length ? (
                <table className="mt-1 w-full text-sm">
                  <tbody>
                    {row.eco_attributes.map((a) => (
                      <tr key={a.slug} className="border-b border-neutral-100 last:border-0">
                        <th
                          scope="row"
                          className="py-1.5 pe-3 text-left font-normal text-neutral-500"
                        >
                          {a.name}
                        </th>
                        <td className="py-1.5 text-neutral-900 tabular-nums">
                          {a.values.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">None filled in.</p>
              )}
              {warnings.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                  {warnings.map((w) => (
                    <li key={w} className="flex gap-2">
                      <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {row.rejection_reason && (
            <p className="text-sm text-red-700">
              Rejected {formatDate(row.reviewed_at)}: {row.rejection_reason}
            </p>
          )}
          {row.status === "approved" && (
            <p className="text-sm text-neutral-600">Approved {formatDate(row.reviewed_at)}.</p>
          )}
          {row.status === "withdrawn" && (
            <p className="text-sm text-neutral-600">The supplier withdrew this declaration.</p>
          )}

          {reviewable && (
            <div className="space-y-3 border-t border-neutral-200 pt-4">
              {!rejecting && !confirmingApprove && (
                <div className="flex flex-wrap gap-2">
                  {row.status !== "approved" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingApprove(true)}
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                    >
                      Approve
                    </button>
                  )}
                  {row.status !== "rejected" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejecting(true)}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-40"
                    >
                      {row.status === "approved" ? "Revoke approval" : "Reject"}
                    </button>
                  )}
                </div>
              )}

              {confirmingApprove && (
                <div className="space-y-2 rounded-md bg-neutral-50 p-3">
                  <p className="max-w-prose text-sm text-neutral-700">
                    The product will show "Plastic-ban ready · declared by supplier, reviewed by
                    MaterialHub" and join the plastic-ban ready filter and collection. This confirms
                    you reviewed the declaration and evidence for the listing; it is not a legal
                    certification.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(() => approve.mutateAsync(row.id), `Approved: ${productName}`)
                      }
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                    >
                      {approve.isPending ? "Approving…" : "Confirm approval"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingApprove(false)}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {rejecting && (
                <div className="space-y-2">
                  <label
                    htmlFor={`reason-${row.id}`}
                    className="block text-sm font-medium text-neutral-800"
                  >
                    Reason{" "}
                    <span className="font-normal text-neutral-500">(the supplier sees this)</span>
                  </label>
                  <textarea
                    id={`reason-${row.id}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    aria-describedby={`reason-hint-${row.id}`}
                    className="w-full max-w-2xl rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
                    placeholder="e.g. The cup has a PE lining, so it is not plastic-free."
                  />
                  <p id={`reason-hint-${row.id}`} className="text-xs text-neutral-500">
                    At least 5 characters. Say what to change so they can resubmit.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !reasonOk}
                      onClick={() =>
                        run(
                          () => reject.mutateAsync({ id: row.id, reason: reason.trim() }),
                          `${row.status === "approved" ? "Approval revoked" : "Rejected"}: ${productName}`,
                        )
                      }
                      className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                    >
                      {reject.isPending ? "Rejecting…" : "Confirm rejection"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejecting(false)}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function EcoDeclarationsPage() {
  const [tab, setTab] = useState<EcoDeclarationStatus | "all">("pending");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // A new tab or search starts at page 1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on filter change
  useEffect(() => {
    setPage(1);
  }, [tab, debounced]);

  const { data, isLoading, isError, isFetching, refetch } = useEcoDeclarations({
    status: tab,
    q: debounced,
    page,
    limit: PAGE_SIZE,
  });
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="p-4">
      <h1 className="mb-1 text-xl font-semibold">Plastic-ban declarations</h1>
      <p className="mb-4 max-w-3xl text-sm text-neutral-500">
        Suppliers declare products plastic-ban ready under the UAE single-use plastics ban.
        Approving shows the badge and adds the product to the plastic-ban ready filter and
        collection. It records that MaterialHub reviewed the declaration; it is not a legal
        certification.
      </p>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b">
        <div role="tablist" aria-label="Declaration status" className="flex gap-1 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setOpenId(null);
              }}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                tab === key
                  ? "border-neutral-900 font-medium text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mb-2 w-full sm:w-72">
          <label htmlFor="eco-search" className="sr-only">
            Search product, supplier or SKU
          </label>
          <input
            id="eco-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product, supplier or SKU"
            className="h-9 w-full rounded-md border border-neutral-300 px-3 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>
      </div>

      {flash && (
        <output className="mb-3 flex items-center justify-between gap-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {flash}
          <button type="button" onClick={() => setFlash(null)} className="text-xs underline">
            Dismiss
          </button>
        </output>
      )}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : isError ? (
        <div className="text-sm text-red-600">
          Couldn't load declarations.{" "}
          <button type="button" onClick={() => refetch()} className="underline">
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {debounced
            ? `No declarations match "${debounced}".`
            : tab === "pending"
              ? "Nothing awaiting review."
              : tab === "all"
                ? "No declarations yet."
                : `No ${tab} declarations.`}
        </p>
      ) : (
        <>
          <ul className={`space-y-3 ${isFetching ? "opacity-70" : ""}`}>
            {rows.map((row) => (
              <DeclarationRow
                key={row.id}
                row={row}
                open={openId === row.id}
                onToggle={() => setOpenId((id) => (id === row.id ? null : row.id))}
                onDone={(message) => {
                  setFlash(message);
                  setOpenId(null);
                }}
              />
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-neutral-600">
            <span className="tabular-nums">
              {from}–{to} of {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!data?.hasMore}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
