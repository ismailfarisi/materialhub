"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  StatusBadge,
  FiltersBar,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
} from "@materialhub/ui";
import {
  useReturns,
  useApproveReturn,
  useRejectReturn,
  type ReturnRequest,
} from "@/lib/queries/returns";

const STATUS_OPTIONS = [
  { label: "Requested", value: "requested" },
  { label: "Approved", value: "approved" },
  { label: "Shipped back", value: "shipped_back" },
  { label: "Received", value: "received" },
  { label: "Refunded", value: "refunded" },
  { label: "Rejected", value: "rejected" },
];

function formatFils(fils: number) {
  return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface RejectDialogProps {
  returnReq: ReturnRequest | null;
  onClose: () => void;
}

function RejectDialog({ returnReq, onClose }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  const { mutate: reject, isPending } = useRejectReturn();

  function handleSubmit() {
    if (!returnReq || !reason.trim()) return;
    reject({ id: returnReq.id, reason: reason.trim() }, { onSuccess: onClose });
  }

  return (
    <Dialog open={!!returnReq} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Reject Return — {returnReq?.return_number ?? returnReq?.id.slice(0, 8)}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <label className="block text-sm font-medium text-cacao mb-1">Rejection Reason</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason for rejection..."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={isPending || !reason.trim()}>
            {isPending ? "Rejecting..." : "Reject Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RefundDialogProps {
  returnReq: ReturnRequest | null;
  onClose: () => void;
}

function RefundDialog({ returnReq, onClose }: RefundDialogProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("original_payment");
  const { mutate: approve, isPending } = useApproveReturn();

  function handleSubmit() {
    if (!returnReq) return;
    const fils = amount ? Math.round(Number(amount) * 100) : undefined;
    approve({ id: returnReq.id, refund_amount: fils, refund_method: method as any }, { onSuccess: onClose });
  }

  return (
    <Dialog open={!!returnReq} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Process Refund — {returnReq?.return_number ?? returnReq?.id.slice(0, 8)}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Refund Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full h-9 rounded-md border border-sand bg-cream px-3 py-1 text-sm text-cacao shadow-xs focus:outline-none focus:ring-1 focus:ring-amber"
            >
              <option value="original_payment">Original Payment Method</option>
              <option value="store_credit">Store Credit</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Refund Amount (AED)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe text-sm">AED</span>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-12"
                placeholder="0.00"
                type="number"
                step="0.01"
                min="0"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Processing..." : "Process Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReturnsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

  const [rejectTarget, setRejectTarget] = useState<ReturnRequest | null>(null);
  const [refundTarget, setRefundTarget] = useState<ReturnRequest | null>(null);

  const updateParam = useCallback(
    (updates: Record<string, string | null | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "__all__") params.set(key, value);
        else params.delete(key);
      }
      if (resetPage && !updates.page) params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams],
  );

  const { data, isLoading } = useReturns({
    status: statusFilter === "__all__" ? undefined : statusFilter,
    page,
    limit: pagination.pageSize,
  });

  const returns: ReturnRequest[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  function productSummary(r: ReturnRequest): string {
    const names = (r.returnItems ?? [])
      .map((ri) => ri.orderItem?.product_name)
      .filter((n): n is string => !!n);
    if (names.length === 0) return "—";
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1} more`;
  }

  const columns: ColumnDef<ReturnRequest>[] = [
    {
      id: "return_number",
      header: "Return",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-cacao">
          {row.original.return_number ?? `${row.original.id.slice(0, 8)}…`}
        </span>
      ),
    },
    {
      id: "order_number",
      header: "Order",
      cell: ({ row }) => {
        const num = row.original.order?.order_number ?? row.original.order_number;
        return num ? (
          <span className="font-medium text-cacao">#{num}</span>
        ) : (
          <span className="font-mono text-xs text-taupe">{row.original.order_id.slice(0, 8)}…</span>
        );
      },
    },
    {
      id: "product",
      header: "Product",
      cell: ({ row }) => (
        <span className="text-sm text-cacao max-w-xs truncate block">{productSummary(row.original)}</span>
      ),
    },
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <span className="text-sm text-taupe capitalize">
          {row.original.reason?.replace(/_/g, " ") ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "created_at",
      header: "Submitted",
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-2 justify-end">
            {r.status === "requested" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-600 border-green-300 hover:bg-green-50"
                  onClick={() => setRefundTarget(r)}
                >
                  Approve & Refund
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => setRejectTarget(r)}
                >
                  Reject
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Returns</h1>
        <p className="text-taupe text-sm">Review and process customer return requests.</p>
      </div>

      <FiltersBar
        filters={[
          {
            key: "status",
            label: "Status",
            options: STATUS_OPTIONS,
            value: statusFilter,
            onChange: (v) => updateParam({ status: v }),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={returns}
        isLoading={isLoading}
        pagination={pagination}
        pageCount={pageCount}
        totalCount={total}
        itemLabel="returns"
        onPaginationChange={(updater) => {
          const next = typeof updater === "function" ? updater(pagination) : updater;
          updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
        }}
      />

      <RejectDialog returnReq={rejectTarget} onClose={() => setRejectTarget(null)} />
      <RefundDialog returnReq={refundTarget} onClose={() => setRefundTarget(null)} />
    </div>
  );
}
