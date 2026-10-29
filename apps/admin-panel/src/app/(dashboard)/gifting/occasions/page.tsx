"use client";

import {
  type GiftOccasion,
  useDeleteGiftOccasion,
  useGiftOccasions,
} from "@/lib/queries/gifting";
import { Button, DataTable, toast } from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { OccasionDialog } from "./occasion-dialog";

export default function GiftOccasionsPage() {
  const { data, isLoading } = useGiftOccasions();
  const { mutate: deleteOccasion } = useDeleteGiftOccasion();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GiftOccasion | null>(null);

  const occasions: GiftOccasion[] = data ?? [];

  const columns: ColumnDef<GiftOccasion>[] = [
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
      accessorKey: "sort_order",
      header: "Sort",
      cell: ({ row }) => (
        <span className="text-taupe text-sm">{row.original.sort_order}</span>
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
              deleteOccasion(row.original.id, {
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
          <h1 className="text-2xl font-bold text-cacao mb-1">Gift Occasions</h1>
          <p className="text-taupe text-sm">
            Occasions customers choose when building a gift box.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus size={16} className="mr-1.5" />
          New Occasion
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={occasions}
        isLoading={isLoading}
        totalCount={occasions.length}
        itemLabel="occasions"
      />

      <OccasionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        occasion={editing}
      />
    </div>
  );
}
