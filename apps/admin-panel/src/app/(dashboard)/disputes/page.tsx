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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@materialhub/ui";
import {
  useDisputes,
  useAssignDispute,
  useResolveDispute,
  type Dispute,
} from "@/lib/queries/disputes";

const STATUS_OPTIONS = [
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
  { label: "Escalated", value: "escalated" },
];

const PRIORITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
];

// Placeholder admin list — in production this would come from an API
const ADMIN_USERS = [
  { id: "admin-1", name: "Ahmed Al Rashid" },
  { id: "admin-2", name: "Sara Mohammed" },
  { id: "admin-3", name: "Rahul Sharma" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface AssignDialogProps {
  dispute: Dispute | null;
  onClose: () => void;
}

function AssignDialog({ dispute, onClose }: AssignDialogProps) {
  const [adminId, setAdminId] = useState(dispute?.assigned_to ?? "");
  const { mutate: assign, isPending } = useAssignDispute();

  function handleSubmit() {
    if (!dispute || !adminId) return;
    assign({ id: dispute.id, admin_id: adminId }, { onSuccess: onClose });
  }

  return (
    <Dialog open={!!dispute} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Dispute — #{dispute?.id?.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <label className="block text-sm font-medium text-cacao mb-1">Assign to Admin</label>
          <Select value={adminId} onValueChange={setAdminId}>
            <SelectTrigger>
              <SelectValue placeholder="Select admin user" />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_USERS.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !adminId}>
            {isPending ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ResolveDialogProps {
  dispute: Dispute | null;
  onClose: () => void;
}

function ResolveDialog({ dispute, onClose }: ResolveDialogProps) {
  const [resolution, setResolution] = useState("refund_buyer");
  const [notes, setNotes] = useState("");
  const { mutate: resolve, isPending } = useResolveDispute();

  function handleSubmit() {
    if (!dispute) return;
    resolve(
      { id: dispute.id, resolution, resolution_notes: notes },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={!!dispute} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve Dispute — #{dispute?.id?.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Resolution</label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="refund_buyer">Full Refund to Buyer</SelectItem>
                <SelectItem value="partial_refund">Partial Refund</SelectItem>
                <SelectItem value="favor_seller">Release Funds to Vendor</SelectItem>
                <SelectItem value="replacement">Send Replacement</SelectItem>
                <SelectItem value="dismissed">Dismiss Dispute</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Resolution Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Explain the decision and rationale..."
              className="w-full rounded-md border border-sand bg-cream p-2 text-sm text-cacao placeholder:text-taupe focus:outline-none focus:ring-1 focus:ring-amber"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Resolving..." : "Confirm Resolution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-taupe",
  medium: "text-yellow-600",
  high: "text-orange-600",
  critical: "text-red-600",
};

export default function DisputesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
  const priorityFilter = searchParams.get("priority") ?? "__all__";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

  const [assignTarget, setAssignTarget] = useState<Dispute | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Dispute | null>(null);

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

  const { data, isLoading } = useDisputes({
    status: statusFilter === "__all__" ? undefined : statusFilter,
    priority: priorityFilter === "__all__" ? undefined : priorityFilter,
    page,
    limit: pagination.pageSize,
  });

  const disputes: Dispute[] = data?.disputes ?? data?.items ?? data ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  const columns: ColumnDef<Dispute>[] = [
    {
      accessorKey: "id",
      header: "Dispute ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-taupe">{row.original.id.slice(0, 8)}…</span>
      ),
    },
    {
      accessorKey: "order_number",
      header: "Order",
      cell: ({ row }) => (
        <span className="font-medium text-cacao">#{row.original.order_number}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => (
        <span
          className={`text-sm font-semibold capitalize ${PRIORITY_COLORS[row.original.priority] ?? "text-taupe"}`}
        >
          {row.original.priority}
        </span>
      ),
    },
    {
      accessorKey: "assigned_to_name",
      header: "Assigned To",
      cell: ({ row }) => (
        <span className="text-sm text-taupe">
          {row.original.assigned_to_name ?? <span className="text-taupe italic">Unassigned</span>}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const d = row.original;
        return (
          <div className="flex items-center gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAssignTarget(d)}
            >
              Assign
            </Button>
            {d.status !== "resolved" && (
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 border-green-300 hover:bg-green-50"
                onClick={() => setResolveTarget(d)}
              >
                Resolve
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Disputes</h1>
        <p className="text-taupe text-sm">Manage order disputes, assign to admins, and resolve cases.</p>
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
          {
            key: "priority",
            label: "Priority",
            options: PRIORITY_OPTIONS,
            value: priorityFilter,
            onChange: (v) => updateParam({ priority: v }),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={disputes}
        isLoading={isLoading}
        pagination={pagination}
        pageCount={pageCount}
        totalCount={total}
        itemLabel="disputes"
        onPaginationChange={(updater) => {
          const next = typeof updater === "function" ? updater(pagination) : updater;
          updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
        }}
      />

      <AssignDialog dispute={assignTarget} onClose={() => setAssignTarget(null)} />
      <ResolveDialog dispute={resolveTarget} onClose={() => setResolveTarget(null)} />
    </div>
  );
}
