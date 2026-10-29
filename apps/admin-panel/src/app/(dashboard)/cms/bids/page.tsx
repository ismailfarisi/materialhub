"use client";

import {
  type EnrichedBid,
  useApproveBid,
  useBids,
  usePreviewBidToken,
  useRejectBid,
} from "@/lib/queries/layouts";
import {
  Button,
  DataTable,
  EmptyState,
  FiltersBar,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  Gavel,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Active", value: "active" },
  { label: "Approved", value: "won" },
  { label: "Rejected", value: "lost" },
  { label: "Expired", value: "expired" },
  { label: "Cancelled", value: "cancelled" },
];

const STOREFRONT_BASE = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";

const ACTIVE_STATUSES = new Set(["pending", "active", "won"]);
const HISTORY_STATUSES = new Set(["lost", "expired", "cancelled"]);

function formatAED(fils: number) {
  return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeFromNow(iso?: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function initialsFromName(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export default function BidsPage() {
  const [historyFilter, setHistoryFilter] = useState("__all__");
  const [historyPagination, setHistoryPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const { data: activeData, isLoading: activeLoading } = useBids({ page: 1, limit: 100 });
  const { data: historyData, isLoading: historyLoading } = useBids({
    status: historyFilter === "__all__" ? undefined : historyFilter,
    page: historyPagination.pageIndex + 1,
  });

  const { mutate: approveBid, isPending: approving } = useApproveBid();
  const { mutate: rejectBid, isPending: rejecting } = useRejectBid();
  const { mutateAsync: requestPreview, isPending: previewLoading } = usePreviewBidToken();

  const allBids: EnrichedBid[] = activeData?.data ?? [];
  const activeBids = useMemo(() => allBids.filter((b) => ACTIVE_STATUSES.has(b.status)), [allBids]);
  const historyBids: EnrichedBid[] = useMemo(
    () =>
      (historyData?.data ?? []).filter((b: EnrichedBid) =>
        HISTORY_STATUSES.has(b.status),
      ),
    [historyData],
  );
  const historyCount = useMemo(
    () => allBids.filter((b) => HISTORY_STATUSES.has(b.status)).length,
    [allBids],
  );
  const historyPageCount =
    Math.ceil(historyBids.length / historyPagination.pageSize) || 1;

  const sections = useMemo(() => {
    const map = new Map<string, { section: EnrichedBid["section"]; bids: EnrichedBid[] }>();
    for (const bid of activeBids) {
      const key = bid.section_id;
      if (!map.has(key)) map.set(key, { section: bid.section, bids: [] });
      map.get(key)!.bids.push(bid);
    }
    for (const entry of map.values())
      entry.bids.sort((a, b) => b.bid_amount_fils - a.bid_amount_fils);
    return Array.from(map.values());
  }, [activeBids]);

  async function handlePreview(bidId: string) {
    try {
      const { token, layout_slug } = await requestPreview(bidId);
      const params = new URLSearchParams({ preview_token: token, preview_layout_slug: layout_slug });
      const url = `${STOREFRONT_BASE}/en/?${params.toString()}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("Could not open preview — try again.");
    }
  }

  const historyColumns: ColumnDef<EnrichedBid>[] = [
    {
      accessorKey: "vendor",
      header: "Vendor",
      cell: ({ row }) => row.original.vendor?.name ?? "—",
    },
    {
      accessorKey: "section",
      header: "Section",
      cell: ({ row }) => row.original.section?.type_label?.en ?? "—",
    },
    {
      accessorKey: "bid_amount_fils",
      header: "Amount",
      cell: ({ row }) => formatAED(row.original.bid_amount_fils),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "created_at",
      header: "Placed",
      cell: ({ row }) => relativeFromNow(row.original.created_at),
    },
    {
      id: "preview",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handlePreview(row.original.id)}
          disabled={previewLoading}
        >
          <Eye size={14} />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Bids</h1>
        <p className="text-taupe text-sm">
          Review and approve vendor bids for sponsored layout sections.
        </p>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Active{activeBids.length > 0 ? ` (${activeBids.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="history">
            History{historyCount > 0 ? ` (${historyCount})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          {activeLoading ? (
            <div className="space-y-3">
              {(["sk-0", "sk-1", "sk-2"] as const).map((k) => (
                <Skeleton key={k} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : sections.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-linen">
              <EmptyState
                icon={<Gavel size={28} />}
                title="No active bids"
                description="Vendor bids for sponsored layout sections will appear here when submitted."
              />
            </div>
          ) : (
            <div className="space-y-4">
              {sections.map(({ section, bids }) => (
                <div
                  key={bids[0].section_id}
                  className="rounded-xl border border-stone-200 bg-white overflow-hidden"
                >
                  <div className="border-b border-stone-100 px-4 py-3 bg-stone-50/50">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-semibold text-cacao">
                        {section?.type_label?.en ?? "Section unavailable"}
                      </h3>
                      <span className="text-xs text-taupe">
                        {section
                          ? `${section.layout_title?.en ?? section.layout_slug} · position ${section.position}`
                          : "Linked section was removed"}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1 text-xs text-stone-500 bg-white border border-stone-200 rounded-md px-2 py-0.5">
                        {section ? `${section.slots} slots` : "— slots"} ·{" "}
                        {bids.length} bid{bids.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <ul className="divide-y divide-stone-100">
                    {bids.map((bid) => (
                      <li
                        key={bid.id}
                        className="px-4 py-3 flex items-center gap-3"
                      >
                        {bid.vendor?.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={bid.vendor.logo_url}
                            alt={bid.vendor.name}
                            className="w-7 h-7 rounded-full object-cover bg-stone-200"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-pearl/100 flex items-center justify-center text-[10px] font-semibold text-cacao">
                            {initialsFromName(bid.vendor?.name)}
                          </div>
                        )}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/vendors/${bid.vendor?.id ?? bid.vendor_id}`}
                        className="font-medium text-cacao hover:underline text-sm"
                      >
                        {bid.vendor?.name ?? "Unknown vendor"}
                      </Link>
                      <div className="text-xs text-taupe mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-cacao">
                          {formatAED(bid.bid_amount_fils)}
                        </span>
                        <StatusBadge status={bid.status} />
                        <span>· Placed {relativeFromNow(bid.created_at)}</span>
                        <span>
                          · {formatDate(bid.starts_at)} → {formatDate(bid.expires_at)}
                        </span>
                        {bid.outranked?.is_outranked && bid.outranked.cutoff_vendor_name && (
                          <span className="inline-flex items-center gap-1 text-amber-700 text-[11px]">
                            <AlertTriangle size={12} />
                            Outranked — clear {formatAED(bid.outranked.cutoff_bid_amount_fils ?? 0)}{" "}
                            (held by {bid.outranked.cutoff_vendor_name})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(bid.id)}
                        disabled={previewLoading}
                        title="Preview"
                      >
                        <Eye size={14} />
                      </Button>
                      {bid.status === "pending" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => {
                              if (confirm("Approve this bid?")) approveBid(bid.id);
                            }}
                            disabled={approving}
                            title="Approve"
                          >
                            <CheckCircle size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (confirm("Reject this bid?")) rejectBid(bid.id);
                            }}
                            disabled={rejecting}
                            title="Reject"
                          >
                            <XCircle size={16} />
                          </Button>
                        </>
                      )}
                    </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6 space-y-4">
          <p className="text-sm text-taupe">
            Rejected, expired, and cancelled bids.
          </p>
          <FiltersBar
            filters={[
              {
                key: "status",
                label: "Status",
                options: STATUS_OPTIONS.filter((o) =>
                  HISTORY_STATUSES.has(o.value),
                ),
                value: historyFilter,
                onChange: (v) => {
                  setHistoryFilter(v);
                  setHistoryPagination((p) => ({ ...p, pageIndex: 0 }));
                },
              },
            ]}
          />
          {!historyLoading && historyBids.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-linen">
              <EmptyState
                icon={<Gavel size={28} />}
                title="No bid history"
                description={
                  historyFilter !== "__all__"
                    ? "No bids match this filter. Try another status."
                    : "Rejected, expired, or cancelled bids will appear here."
                }
              />
            </div>
          ) : (
            <DataTable
              columns={historyColumns}
              data={historyBids}
              isLoading={historyLoading}
              pagination={historyPagination}
              pageCount={historyPageCount}
              totalCount={historyBids.length}
              itemLabel="bids"
              onPaginationChange={setHistoryPagination}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
