"use client";

import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "@materialhub/ui";
import { Coins, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatAed, parseAedInput } from "@/lib/money";
import {
  type ShippingContributionTier,
  useBaseCarrierCost,
  useDeleteShippingContributionTier,
  useShippingContributionTiers,
  useUpdateBaseCarrierCost,
  useUpdateShippingContributionTier,
} from "@/lib/queries/shipping-contribution-tiers";
import { useVendorOptions } from "@/lib/queries/shipping-rates";

function BaseCostCard() {
  const { data, isLoading } = useBaseCarrierCost();
  const update = useUpdateBaseCarrierCost();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (data) setValue((data.base_carrier_cost_fils / 100).toFixed(2));
  }, [data]);

  const save = async () => {
    const fils = parseAedInput(value);
    if (fils == null) {
      toast({ title: "Error", description: "Enter a non-negative number", variant: "destructive" });
      return;
    }
    try {
      await update.mutateAsync(fils);
      toast({ title: "Base carrier cost updated" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.message ?? "Save failed",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="base_cost">Postaplus base carrier cost (AED)</Label>
            <Input
              id="base_cost"
              type="number"
              step="0.01"
              min={0}
              className="w-40"
              value={value}
              disabled={isLoading}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="button" onClick={save} disabled={update.isPending || isLoading}>
            Save base cost
          </Button>
          <p className="text-xs text-muted-foreground max-w-md">
            Reference cost per shipment. Used only to show how much MaterialHub UAE absorbs per band — it
            does not change what vendors are charged.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveToggle({ tier }: { tier: ShippingContributionTier }) {
  const update = useUpdateShippingContributionTier(tier.id);
  const [pending, setPending] = useState(false);
  return (
    <Switch
      checked={tier.is_active}
      disabled={pending || update.isPending}
      onCheckedChange={async (next) => {
        setPending(true);
        try {
          await update.mutateAsync({ is_active: next });
          toast({ title: next ? "Band enabled" : "Band disabled" });
        } catch (e: any) {
          toast({
            title: "Error",
            description: e?.response?.data?.message ?? "Toggle failed",
            variant: "destructive",
          });
        } finally {
          setPending(false);
        }
      }}
    />
  );
}

function DeleteButton({ id }: { id: string }) {
  const del = useDeleteShippingContributionTier();
  return (
    <button
      type="button"
      aria-label="Delete band"
      onClick={async () => {
        if (!window.confirm("Delete this contribution band?")) return;
        try {
          await del.mutateAsync(id);
          toast({ title: "Contribution band deleted" });
        } catch (e: any) {
          toast({
            title: "Error",
            description: e?.response?.data?.message ?? "Delete failed",
            variant: "destructive",
          });
        }
      }}
      className="p-1 rounded hover:bg-muted"
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </button>
  );
}

export default function ShippingContributionTiersPage() {
  const [filters, setFilters] = useState<{
    vendor_id?: string;
    is_active?: "true" | "false";
  }>({});
  const { data, isLoading, isError, refetch } = useShippingContributionTiers(filters);
  const vendors = useVendorOptions();
  const baseCost = useBaseCarrierCost();

  const vendorName = (id: string | null) =>
    id == null ? "Platform default" : vendors.data?.find((v) => v.id === id)?.business_name ?? id;

  const absorbed = (contribution: number) => {
    const base = baseCost.data?.base_carrier_cost_fils;
    if (base == null) return "—";
    return formatAed(Math.max(0, base - contribution));
  };

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Coins className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Shipping Contribution Tiers</h1>
            <p className="text-sm text-muted-foreground">
              What each vendor pays toward shipping, by order-value band. Deducted from vendor
              payouts.
            </p>
          </div>
        </div>
        <Link href="/settings/shipping-contribution-tiers/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" /> New band
          </Button>
        </Link>
      </div>

      <BaseCostCard />

      <Card className="mb-4">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Scope</label>
            <Select
              value={filters.vendor_id ?? "__all__"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, vendor_id: v === "__all__" ? undefined : v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="platform">Platform default</SelectItem>
                {vendors.data?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.business_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Active</label>
            <Select
              value={filters.is_active ?? "__any__"}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  is_active: v === "__any__" ? undefined : (v as "true" | "false"),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Any</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Order value from</th>
                <th className="px-4 py-3 font-medium">Vendor pays</th>
                <th className="px-4 py-3 font-medium">MaterialHub UAE absorbs</th>
                <th className="px-4 py-3 font-medium">Sort</th>
                <th className="px-4 py-3 font-medium text-right">Active</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                [1, 2, 3].map((i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))}
              {isError && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <p className="text-destructive mb-2">Failed to load contribution tiers.</p>
                    <button
                      onClick={() => refetch()}
                      className="text-primary hover:underline text-sm"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              )}
              {!isLoading && !isError && data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No contribution bands.{" "}
                    <Link
                      href="/settings/shipping-contribution-tiers/new"
                      className="text-primary hover:underline"
                    >
                      Create the first one.
                    </Link>
                  </td>
                </tr>
              )}
              {data?.map((t) => (
                <tr key={t.id} className="border-b last:border-b-0">
                  <td className="px-4 py-4">{vendorName(t.vendor_id)}</td>
                  <td className="px-4 py-4">{formatAed(t.min_order_value)}</td>
                  <td className="px-4 py-4 font-medium">{formatAed(t.vendor_contribution)}</td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {absorbed(t.vendor_contribution)}
                  </td>
                  <td className="px-4 py-4">{t.sort_order}</td>
                  <td className="px-4 py-4 text-right">
                    <ActiveToggle tier={t} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/settings/shipping-contribution-tiers/${t.id}`}
                        aria-label="Edit band"
                        className="p-1 rounded hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <DeleteButton id={t.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.length > 0 && (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              Total: {data.length} contribution band{data.length === 1 ? "" : "s"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
