"use client";

import { formatAed } from "@/lib/money";
import {
  type GiftStyle,
  useDeleteGiftStyle,
  useGiftStyles,
} from "@/lib/queries/gifting";
import { Button, DataTable, toast } from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { StyleDialog } from "./style-dialog";

export default function GiftStylesPage() {
  const { data, isLoading } = useGiftStyles();
  const { mutate: deleteStyle } = useDeleteGiftStyle();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GiftStyle | null>(null);

  const styles: GiftStyle[] = data ?? [];

  const columns: ColumnDef<GiftStyle>[] = [
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
        <span className="text-taupe text-sm font-mono">{row.original.slug}</span>
      ),
    },
    {
      accessorKey: "max_capacity",
      header: "Capacity",
      cell: ({ row }) => (
        <span className="text-taupe text-sm">
          {row.original.max_capacity ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "base_price",
      header: "Base price",
      cell: ({ row }) => (
        <span className="text-taupe text-sm">{formatAed(row.original.base_price)}</span>
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
          <Button
            variant="ghost"
            size="sm"
            className="p-2"
            onClick={() => {
              setEditing(row.original);
              setDialogOpen(true);
            }}
          >
            <Pencil size={15} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="p-2 text-red-600"
            onClick={() => {
              if (!confirm(`Delete "${row.original.name}"?`)) return;
              deleteStyle(row.original.id, {
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
          <h1 className="text-2xl font-bold text-cacao mb-1">Box Styles</h1>
          <p className="text-taupe text-sm">
            Physical gift box options customers can choose from.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus size={16} className="mr-1.5" />
          New Box Style
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={styles}
        isLoading={isLoading}
        totalCount={styles.length}
        itemLabel="box styles"
      />

      <StyleDialog open={dialogOpen} onOpenChange={setDialogOpen} style={editing} />
    </div>
  );
}
