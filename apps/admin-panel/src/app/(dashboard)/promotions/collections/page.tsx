"use client";

import {
  type Collection,
  useCollections,
  useDeleteCollection,
} from "@/lib/queries/collections";
import { Button, DataTable, toast } from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function CollectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

  const updateParam = useCallback(
    (updates: Record<string, string | null | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      if (resetPage && !updates.page) params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams],
  );

  const [search, setSearch] = useState(searchParam);
  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== searchParam) {
        updateParam({ search: search || null }, true);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [search, searchParam, updateParam]);

  const { data, isLoading } = useCollections({
    search: searchParam || undefined,
    page,
    limit: pagination.pageSize,
  });

  const { mutate: deleteCollection } = useDeleteCollection();

  const collections: Collection[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  const columns: ColumnDef<Collection>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium text-cacao">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => (
        <span className="text-taupe text-sm font-mono">
          {row.original.slug}
        </span>
      ),
    },
    {
      accessorKey: "kind",
      header: "Kind",
      cell: ({ row }) => (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
          {row.original.kind}
        </span>
      ),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            row.original.is_active
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {row.original.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" asChild className="p-2">
            <Link href={`/promotions/collections/${row.original.id}`}>
              <Pencil size={15} />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="p-2 text-red-600"
            onClick={() => {
              if (!confirm(`Delete "${row.original.name}"?`)) return;
              deleteCollection(row.original.id, {
                onSuccess: () => toast({ title: "Deleted" }),
                onError: (e: any) =>
                  toast({
                    title: "Error",
                    description: e?.response?.data?.message ?? "Delete failed.",
                    variant: "destructive",
                  }),
              });
            }}
          >
            <Trash2 size={15} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cacao mb-1">Collections</h1>
          <p className="text-taupe text-sm">
            Curated product sets for promotions.
          </p>
        </div>
        <Button asChild>
          <Link href="/promotions/collections/new">
            <Plus size={16} className="mr-1.5" />
            New Collection
          </Link>
        </Button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or slug…"
        className="w-full max-w-sm rounded-md border border-gray-300 bg-background px-3 py-2 text-sm"
      />

      <DataTable
        columns={columns}
        data={collections}
        isLoading={isLoading}
        pagination={pagination}
        pageCount={pageCount}
        totalCount={total}
        itemLabel="collections"
        onPaginationChange={(updater) => {
          const next = typeof updater === "function" ? updater(pagination) : updater;
          updateParam({ page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null }, false);
        }}
      />
    </div>
  );
}
