"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  StatusBadge,
  FiltersBar,
  Button,
  EmptyState,
  Skeleton,
} from "@materialhub/ui";
import { usePages, useDeletePage } from "@/lib/queries/cms";
import { FileText, Plus, Pencil, Trash2 } from "lucide-react";

interface Page {
  id: string;
  title: string;
  slug: string;
  status: string;
  locale: string;
  author?: { first_name?: string; last_name?: string; email?: string };
  updated_at: string;
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Archived", value: "archived" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CmsPagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = searchParams.get("status") ?? "__all__";
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

  const { data, isLoading } = usePages({
    status: statusFilter === "__all__" ? undefined : statusFilter,
    page,
    limit: pagination.pageSize,
  });
  const { mutate: deletePage } = useDeletePage();

  const pages: Page[] = data?.data ?? data?.pages ?? data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  const columns: ColumnDef<Page>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="font-medium text-cacao">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-taupe">{row.original.slug}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "locale",
      header: "Locale",
      cell: ({ row }) => (
        <span className="uppercase text-xs font-medium text-taupe">{row.original.locale}</span>
      ),
    },
    {
      accessorKey: "author",
      header: "Author",
      cell: ({ row }) => {
        const a = row.original.author;
        if (!a) return <span className="text-taupe">—</span>;
        const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || a.email || "—";
        return <span>{name}</span>;
      },
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row }) => formatDate(row.original.updated_at),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 justify-end">
          <button
            className="p-1.5 rounded hover:bg-pearl/100 text-taupe hover:text-cacao"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/cms/pages/${row.original.id}/edit`);
            }}
            aria-label="Edit page"
            title="Edit page"
          >
            <Pencil size={15} />
          </button>
          <button
            className="p-1.5 rounded hover:bg-red-50 text-taupe hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete page "${row.original.title}"?`)) {
                deletePage(row.original.id);
              }
            }}
            aria-label="Delete page"
            title="Delete page"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold text-cacao">CMS Pages</h1>
            {!isLoading && total > 0 && (
              <span className="text-sm text-taupe">
                ({total.toLocaleString("en-AE")})
              </span>
            )}
          </div>
          <p className="text-taupe text-sm mt-1">
            Static pages like About, FAQ, Terms, Privacy.
          </p>
        </div>
        <Button onClick={() => router.push("/cms/pages/new")}>
          <Plus size={16} className="mr-1.5" />
          New Page
        </Button>
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-linen">
          <EmptyState
            icon={<FileText size={28} />}
            title={
              statusFilter !== "__all__"
                ? "No pages match this filter"
                : "No CMS pages yet"
            }
            description={
              statusFilter !== "__all__"
                ? "Try switching the status filter to see other pages."
                : "Create static pages for content like About, FAQ, Shipping, or Terms & Privacy."
            }
            action={{
              label:
                statusFilter !== "__all__"
                  ? "Clear filter"
                  : "Create your first page",
              onClick: () => {
                if (statusFilter !== "__all__") {
                  updateParam({ status: null });
                } else {
                  router.push("/cms/pages/new");
                }
              },
            }}
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={pages}
          isLoading={isLoading}
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="pages"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
          }}
        />
      )}
    </div>
  );
}
