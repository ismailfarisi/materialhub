"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef, Row } from "@tanstack/react-table";
import {
  DataTable,
  FiltersBar,
  Input,
  Skeleton,
} from "@materialhub/ui";
import { useAuditFacets, useAuditLog } from "@/lib/queries/audit";
import { entityTypeLabel } from "./audit-labels";
import { Search, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";

interface AuditEntry {
  id: string;
  created_at: string;
  actor?: { id?: string; first_name?: string; last_name?: string; email?: string } | null;
  actor_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string;
  ip_address?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
}

// Verbs match "<entity>.<verb>" on any entity server-side ("create" finds
// "categories.create", "login" finds "user.login" and "user.login_2fa").
const ACTION_OPTIONS = [
  { label: "Create", value: "create" },
  { label: "Update", value: "update" },
  { label: "Delete", value: "delete" },
  { label: "Login", value: "login" },
  { label: "Logout", value: "logout" },
  { label: "Approve", value: "approve" },
  { label: "Reject", value: "reject" },
  { label: "Export", value: "export" },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ChangesTable({ changes }: { changes?: Record<string, { old: unknown; new: unknown }> }) {
  if (!changes || Object.keys(changes).length === 0) {
    return <p className="text-xs text-taupe italic">No change details recorded.</p>;
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-taupe">
          <th className="pb-1 pr-3 font-medium w-32">Field</th>
          <th className="pb-1 pr-3 font-medium">Old Value</th>
          <th className="pb-1 px-2 text-gray-300 w-6"></th>
          <th className="pb-1 pl-0 font-medium">New Value</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(changes).map(([field, diff]) => (
          <tr key={field} className="border-t border-gray-100">
            <td className="py-1.5 pr-3 font-mono text-cacao font-medium">{field}</td>
            <td className="py-1.5 pr-2">
              <span className="inline-block px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-mono break-all max-w-xs">
                {renderValue(diff.old)}
              </span>
            </td>
            <td className="py-1.5 px-2 text-taupe">
              <ArrowRight size={10} />
            </td>
            <td className="py-1.5 pl-0">
              <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono break-all max-w-xs">
                {renderValue(diff.new)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExpandedRow({ entry }: { entry: AuditEntry }) {
  return (
    <div className="px-6 py-4 bg-pearl/50 border-t border-gray-100 space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-taupe uppercase tracking-wide mb-2">Changes</h4>
        <ChangesTable changes={entry.changes} />
      </div>
      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-taupe uppercase tracking-wide mb-2">Metadata</h4>
          <pre className="text-xs bg-linen border border-gray-200 rounded-lg p-3 overflow-x-auto text-cacao">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const actorSearchParam = searchParams.get("actor") ?? "";
  const actionFilter = searchParams.get("action") ?? "__all__";
  const entityTypeFilter = searchParams.get("entity_type") ?? "__all__";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 25 }), [page]);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  const [actorSearch, setActorSearch] = useState(actorSearchParam);
  useEffect(() => {
    setActorSearch(actorSearchParam);
  }, [actorSearchParam]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (actorSearch !== actorSearchParam) {
        updateParam({ actor: actorSearch || null }, true);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [actorSearch, actorSearchParam, updateParam]);

  const { data: facets } = useAuditFacets();
  // Options are the entity types actually stored, so a filter always matches rows.
  const entityTypeOptions = useMemo(
    () =>
      (facets?.entity_types ?? []).map((value) => ({ label: entityTypeLabel(value), value })),
    [facets],
  );

  const { data, isLoading } = useAuditLog({
    actor: actorSearchParam || undefined,
    action: actionFilter === "__all__" ? undefined : actionFilter,
    entity_type: entityTypeFilter === "__all__" ? undefined : entityTypeFilter,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    limit: pagination.pageSize,
  });

  const entries: AuditEntry[] = data?.data?? (Array.isArray(data) ? data : []);
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const columns: ColumnDef<AuditEntry>[] = [
    {
      id: "expand",
      header: "",
      cell: ({ row }) => (
        <button
          onClick={() => toggleRow(row.original.id)}
          className="p-1 rounded hover:bg-pearl/100 text-taupe hover:text-cacao"
          aria-label={expandedRows.has(row.original.id) ? "Collapse" : "Expand"}
        >
          {expandedRows.has(row.original.id) ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Timestamp",
      cell: ({ row }) => (
        <span className="text-sm text-taupe whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
      ),
    },
    {
      id: "actor",
      header: "Actor",
      cell: ({ row }) => {
        const a = row.original.actor;
        if (!a) {
          // No user row: a system job, or an account that no longer exists.
          const role = row.original.actor_role;
          const label = row.original.actor_id
            ? `Deleted user${role ? ` (${role})` : ""}`
            : "System";
          return <span className="text-taupe text-sm italic">{label}</span>;
        }
        const name =
          `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.email || "—";
        return (
          <div>
            <p className="text-sm font-medium text-cacao">{name}</p>
            {a.email && name !== a.email && (
              <p className="text-xs text-taupe">{a.email}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
          {row.original.action}
        </span>
      ),
    },
    {
      id: "entity",
      header: "Entity",
      cell: ({ row }) => (
        <div>
          <span className="text-sm font-medium text-cacao">{entityTypeLabel(row.original.entity_type)}</span>
          {row.original.entity_id && (
            <p className="text-xs text-taupe font-mono">{row.original.entity_id.slice(0, 12)}…</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "ip_address",
      header: "IP Address",
      cell: ({ row }) => (
        <span className="text-sm font-mono text-taupe">{row.original.ip_address ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Audit Log</h1>
        <p className="text-taupe text-sm">Track all admin and system actions across the platform.</p>
      </div>

      {/* Filters */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
          <Input
            value={actorSearch}
            onChange={(e) => setActorSearch(e.target.value)}
            placeholder="Search actor…"
            className="pl-8 w-44"
          />
        </div>

        <FiltersBar
          filters={[
            {
              key: "action",
              label: "Action",
              options: ACTION_OPTIONS,
              value: actionFilter,
              onChange: (v) => updateParam({ action: v }),
            },
            {
              key: "entity_type",
              label: "Entity Type",
              options: entityTypeOptions,
              value: entityTypeFilter,
              onChange: (v) => updateParam({ entity_type: v }),
            },
          ]}
        />

        <div className="flex items-center gap-2">
          <div>
            <label className="block text-xs text-taupe mb-0.5">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => updateParam({ date_from: e.target.value || null })}
              className="w-36"
            />
          </div>
          <div>
            <label className="block text-xs text-taupe mb-0.5">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => updateParam({ date_to: e.target.value || null })}
              className="w-36"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <DataTable
            columns={columns}
            data={entries}
            isLoading={isLoading}
            pagination={pagination}
            pageCount={pageCount}
            totalCount={total}
            itemLabel="entries"
            onPaginationChange={(updater) => {
              const next = typeof updater === "function" ? updater(pagination) : updater;
              updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
            }}
          />
          {/* Expanded row content rendered below each DataTable row */}
          {entries.map((entry) =>
            expandedRows.has(entry.id) ? (
              <ExpandedRow key={`expanded-${entry.id}`} entry={entry} />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
