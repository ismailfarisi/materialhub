"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  toast,
} from "@materialhub/ui";
import { Pencil, Plus, ChevronDown, ChevronRight, Save } from "lucide-react";
import {
  useCommissionConfig,
  useUpdateCategoryCommission,
  useUpdateVendorCommission,
  useGlobalCommissionRate,
  useUpdateGlobalCommissionRate,
  type CategoryCommission,
  type VendorCommission,
  type CommissionTier,
} from "@/lib/queries/commissions";
import { formatPercent, formatVendorRate, parsePercentInput } from "@/lib/commission.helpers";
import { apiErrorMessage } from "@/lib/business.helpers";
import { formatAedGrouped, parseAedInput } from "@/lib/money";

// Rates are stored and sent as percent (10 = 10%); see commission.helpers.ts.
function saveFailed(err: unknown) {
  toast({
    title: "Commission not saved",
    description: apiErrorMessage(err, "Try again."),
    variant: "destructive",
  });
}

// ---- Global Default ----
function GlobalDefaultCard() {
  const { data: rate, isLoading } = useGlobalCommissionRate();
  const { mutate: update, isPending } = useUpdateGlobalCommissionRate();
  const [editing, setEditing] = useState(false);
  const [rateInput, setRateInput] = useState("");

  const currentRate = rate ?? 10;

  function handleSave() {
    const parsed = parsePercentInput(rateInput);
    if (parsed == null) {
      toast({ title: "Enter a rate between 0 and 100%", variant: "destructive" });
      return;
    }
    update(parsed, { onSuccess: () => setEditing(false), onError: saveFailed });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Global Default Commission</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-32" />
        ) : editing ? (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Input
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                className="w-28 pr-6"
                placeholder="e.g. 10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-taupe text-sm">%</span>
            </div>
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              <Save size={14} className="mr-1" />
              {isPending ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold tabular-nums text-cacao">{formatPercent(currentRate)}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRateInput(String(currentRate));
                setEditing(true);
              }}
            >
              <Pencil size={14} className="mr-1" />
              Edit
            </Button>
          </div>
        )}
        <p className="text-xs text-taupe mt-2">
          Applied to all vendors unless a category or vendor override exists.
        </p>
      </CardContent>
    </Card>
  );
}

// ---- Per-Category Overrides ----
interface CategoryOverrideDialogProps {
  open: boolean;
  override?: CategoryCommission | null;
  onClose: () => void;
}

function CategoryOverrideDialog({ open, override, onClose }: CategoryOverrideDialogProps) {
  const [categoryId, setCategoryId] = useState(override?.category_id ?? "");
  const [rate, setRate] = useState(override ? String(Number(override.rate)) : "");
  const { mutate: update, isPending } = useUpdateCategoryCommission();

  function handleSubmit() {
    const parsed = parsePercentInput(rate);
    if (!categoryId.trim() || parsed == null) {
      toast({ title: "Enter a category and a rate between 0 and 100%", variant: "destructive" });
      return;
    }
    update({ categoryId: categoryId.trim(), rate: parsed }, { onSuccess: onClose, onError: saveFailed });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{override ? "Edit Category Rate" : "Add Category Override"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!override && (
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Category ID</label>
              <Input value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="Category ID" />
            </div>
          )}
          {override && (
            <p className="text-sm font-medium text-cacao">{override.category_name}</p>
          )}
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Commission Rate (%)</label>
            <div className="relative">
              <Input
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="pr-6"
                placeholder="e.g. 12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-taupe text-sm">%</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryOverridesTable({ overrides }: { overrides: CategoryCommission[] }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategoryCommission | null>(null);

  const columns: ColumnDef<CategoryCommission>[] = [
    {
      accessorKey: "category_name",
      header: "Category",
      cell: ({ row }) => (
        <span className="font-medium text-cacao">{row.original.category_name}</span>
      ),
    },
    {
      accessorKey: "rate",
      header: "Commission Rate",
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums text-cacao">{formatPercent(row.original.rate)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" variant="ghost" onClick={() => setEditTarget(row.original)}>
          <Pencil size={14} />
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Per-Category Overrides</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={14} className="mr-1" />
          Add Override
        </Button>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={overrides}
          isLoading={false}
          totalCount={overrides.length}
          itemLabel="overrides"
        />
      </CardContent>

      <CategoryOverrideDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {editTarget && (
        <CategoryOverrideDialog
          open={!!editTarget}
          override={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </Card>
  );
}

// ---- Per-Vendor Overrides ----
function TiersSubTable({
  tiers,
  vendorId,
  baseValue,
}: {
  tiers: CommissionTier[];
  vendorId: string;
  baseValue: number;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editMin, setEditMin] = useState("");
  const [editMax, setEditMax] = useState("");
  const [editRate, setEditRate] = useState("");
  const { mutate: update, isPending } = useUpdateVendorCommission();

  function handleSaveTier(index: number) {
    // Inputs are AED and percent; the API stores fils and percent.
    const min = parseAedInput(editMin || "0");
    const max = editMax.trim() ? parseAedInput(editMax) : null;
    const rate = parsePercentInput(editRate);
    if (min == null || rate == null || (editMax.trim() && max == null) || (max != null && max < min)) {
      toast({ title: "Check the tier: amounts in AED, rate between 0 and 100%", variant: "destructive" });
      return;
    }
    const updatedTiers = tiers.map((t, i) =>
      i === index ? { min_amount: min, max_amount: max, rate } : t
    );
    update(
      { vendorId, type: "tiered", value: baseValue, tiers: updatedTiers },
      { onSuccess: () => setEditingIndex(null), onError: saveFailed }
    );
  }

  return (
    <div className="mt-2 border border-gray-200 rounded">
      <table className="w-full text-sm" data-stack="md">
        <thead>
          <tr className="bg-pearl/50 border-b border-gray-200">
            <th className="text-left px-3 py-2 text-xs font-semibold text-taupe">Min Amount (AED)</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-taupe">Max Amount (AED)</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-taupe">Rate</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, i) =>
            editingIndex === i ? (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-3 py-2" data-label="Min Amount (AED)">
                  <Input value={editMin} onChange={(e) => setEditMin(e.target.value)} className="h-7 text-xs w-24" />
                </td>
                <td className="px-3 py-2" data-label="Max Amount (AED)">
                  <Input value={editMax} onChange={(e) => setEditMax(e.target.value)} className="h-7 text-xs w-24" placeholder="∞" />
                </td>
                <td className="px-3 py-2" data-label="Rate">
                  <div className="relative w-20">
                    <Input value={editRate} onChange={(e) => setEditRate(e.target.value)} className="h-7 text-xs pr-5" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-taupe text-xs">%</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-xs" disabled={isPending} onClick={() => handleSaveTier(i)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingIndex(null)}>
                      Cancel
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={i} className="border-b border-gray-100 hover:bg-pearl/50 group">
                <td className="px-3 py-2 tabular-nums text-cacao" data-label="Min Amount (AED)">{formatAedGrouped(tier.min_amount)}</td>
                <td className="px-3 py-2 text-cacao" data-label="Max Amount (AED)">
                  {tier.max_amount != null ? formatAedGrouped(tier.max_amount) : "No limit"}
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums text-cacao" data-label="Rate">{formatPercent(tier.rate)}</td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 opacity-0 group-hover:opacity-100"
                    onClick={() => {
                      setEditingIndex(i);
                      setEditMin((tier.min_amount / 100).toFixed(2));
                      setEditMax(tier.max_amount != null ? (tier.max_amount / 100).toFixed(2) : "");
                      setEditRate(String(Number(tier.rate)));
                    }}
                  >
                    <Pencil size={12} />
                  </Button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function VendorOverridesTable({ overrides }: { overrides: VendorCommission[] }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per-Vendor Overrides</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[32px_1fr_140px_80px] gap-3 items-center px-4 py-2 bg-pearl/50 border-b border-gray-200 text-xs font-semibold text-taupe uppercase">
            <span />
            <span>Vendor</span>
            <span>Base Rate</span>
            <span>Tiers</span>
          </div>
          {overrides.length === 0 ? (
            <div className="text-center py-8 text-taupe text-sm">No vendor overrides.</div>
          ) : (
            overrides.map((v) => (
              <div key={v.id}>
                <div className="grid grid-cols-[32px_1fr_140px_80px] gap-3 items-center px-4 py-3 border-b border-gray-100 hover:bg-pearl/50">
                  <button
                    onClick={() => toggle(v.id)}
                    className="p-1 text-taupe hover:text-cacao"
                    title={v.tiers && v.tiers.length > 0 ? "Show tiers" : "No tiers"}
                    disabled={!v.tiers || v.tiers.length === 0}
                  >
                    {expandedRows.has(v.id) ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} className={!v.tiers?.length ? "opacity-30" : ""} />
                    )}
                  </button>
                  <span className="font-medium text-cacao text-sm">{v.vendor_name}</span>
                  <span className="font-semibold tabular-nums text-cacao">{formatVendorRate(v.commission_type, v.rate)}</span>
                  <span className="text-sm text-taupe">{v.tiers?.length ?? 0} tiers</span>
                </div>
                {expandedRows.has(v.id) && v.tiers && v.tiers.length > 0 && (
                  <div className="px-10 py-3 bg-pearl/50 border-b border-gray-200">
                    <TiersSubTable tiers={v.tiers} vendorId={v.vendor_id} baseValue={v.rate} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommissionsPage() {
  const { data, isLoading } = useCommissionConfig();

  const categoryOverrides = data?.category_overrides ?? [];
  const vendorOverrides = data?.vendor_overrides ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Commissions</h1>
        <p className="text-taupe text-sm">
          Configure platform commission rates — global default, per category, and per vendor with tiered rates.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <GlobalDefaultCard />
          <CategoryOverridesTable overrides={categoryOverrides} />
          <VendorOverridesTable overrides={vendorOverrides} />
        </>
      )}
    </div>
  );
}
