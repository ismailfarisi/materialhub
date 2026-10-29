"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  StatusBadge,
  FiltersBar,
  Input,
  Skeleton,
} from "@materialhub/ui";
import { useTickets } from "@/lib/queries/support";
import { Search } from "lucide-react";

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  // Flat columns + selectively-joined relations (id/email/name only).
  user_id?: string | null;
  guest_email?: string | null;
  guest_name?: string | null;
  user?: { id?: string; email?: string; first_name?: string; last_name?: string } | null;
  status: string;
  priority: string;
  assigned_to?: string | null;
  assignedToUser?: { id?: string; email?: string; first_name?: string; last_name?: string } | null;
  created_at: string;
}

function personName(
  p?: { email?: string; first_name?: string; last_name?: string } | null,
): string | null {
  if (!p) return null;
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || null;
}

const STATUS_OPTIONS = [
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Waiting Customer", value: "waiting_customer" },
  { label: "Resolved", value: "resolved" },
  { label: "Closed", value: "closed" },
];

const PRIORITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SupportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
  const priorityFilter = searchParams.get("priority") ?? "__all__";
  const assignedSearchParam = searchParams.get("assigned_to") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

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

  const [assignedSearch, setAssignedSearch] = useState(assignedSearchParam);
  useEffect(() => {
    setAssignedSearch(assignedSearchParam);
  }, [assignedSearchParam]);

  const { data, isLoading } = useTickets({
    status: statusFilter === "__all__" ? undefined : statusFilter,
    priority: priorityFilter === "__all__" ? undefined : priorityFilter,
    assigned_to: assignedSearchParam || undefined,
    page,
    limit: pagination.pageSize,
  });

  // Backend envelope: { statusCode, data: { data: [...], total, page, limit } };
  // the query hook returns res.data.data, so tickets live under `.data`.
  const tickets: Ticket[] = data?.data ?? data?.tickets ?? data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  const columns: ColumnDef<Ticket>[] = [
    {
      accessorKey: "ticket_number",
      header: "Ticket #",
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/support/${row.original.id}`)}
          className="font-mono text-sm font-medium text-amber hover:underline"
        >
          {row.original.ticket_number}
        </button>
      ),
    },
    {
      accessorKey: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <span className="font-medium text-cacao line-clamp-1">{row.original.subject}</span>
      ),
    },
    {
      id: "user_email",
      header: "User",
      cell: ({ row }) => {
        const t = row.original;
        const registered = personName(t.user) ?? t.user?.email;
        if (registered) return <span className="text-sm text-taupe">{registered}</span>;
        if (t.guest_email || t.guest_name) {
          return (
            <span className="text-sm text-taupe">
              {t.guest_email ?? t.guest_name}
              <span className="ml-1 text-xs text-taupe/70">(guest)</span>
            </span>
          );
        }
        if (t.user_id) {
          return <span className="text-sm text-taupe">Customer {t.user_id.slice(0, 8)}</span>;
        }
        return <span className="text-taupe">—</span>;
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => <StatusBadge status={row.original.priority} />,
    },
    {
      id: "assigned_to",
      header: "Assigned To",
      cell: ({ row }) => {
        const t = row.original;
        const name = personName(t.assignedToUser);
        if (name) return <span className="text-sm text-cacao">{name}</span>;
        if (t.assigned_to) return <span className="text-sm text-cacao">Agent {t.assigned_to.slice(0, 8)}</span>;
        return <span className="text-taupe text-sm">Unassigned</span>;
      },
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-taupe">{formatDate(row.original.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Support Tickets</h1>
        <p className="text-taupe text-sm">Manage customer support requests.</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
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
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
          <Input
            value={assignedSearch}
            onChange={(e) => {
              setAssignedSearch(e.target.value);
              updateParam({ assigned_to: e.target.value || null });
            }}
            placeholder="Search assigned to…"
            className="pl-8 w-48"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={tickets}
          isLoading={isLoading}
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="tickets"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
          }}
        />
      )}
    </div>
  );
}
