"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "@materialhub/ui";
import { Plus, Trash2, Pencil, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatAed } from "@/lib/money";
import {
  type ShippingRate,
  useDeleteShippingRate,
  useShippingRates,
  useUpdateShippingRate,
  useVendorOptions,
  useZoneOptions,
} from "@/lib/queries/shipping-rates";

const KNOWN_METHODS = new Set(["standard", "express", "same_day", "pickup"]);

function MethodBadge({ method }: { method: string }) {
  const known = KNOWN_METHODS.has(method);
  return (
    <Badge
      variant="outline"
      className={known ? "" : "border-amber-500 text-amber-700"}
    >
      {method}
    </Badge>
  );
}

function ActiveToggle({ rate }: { rate: ShippingRate }) {
  const update = useUpdateShippingRate(rate.id);
  const [pending, setPending] = useState(false);
  return (
    <Switch
      checked={rate.is_active}
      disabled={pending || update.isPending}
      onCheckedChange={async (next) => {
        setPending(true);
        try {
          await update.mutateAsync({ is_active: next });
          toast({ title: next ? "Rate enabled" : "Rate disabled" });
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
  const del = useDeleteShippingRate();
  return (
    <button
      type="button"
      aria-label="Delete rate"
      onClick={async () => {
        if (!window.confirm("Delete this shipping rate?")) return;
        try {
          await del.mutateAsync(id);
          toast({ title: "Shipping rate deleted" });
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

export default function ShippingRatesPage() {
  const [filters, setFilters] = useState<{
    vendor_id?: string;
    zone_id?: string;
    method?: string;
    is_active?: "true" | "false";
  }>({});
  const { data, isLoading, isError, refetch } = useShippingRates(filters);
  const vendors = useVendorOptions();
  const zones = useZoneOptions();

  const vendorName = (id: string | null) =>
    id == null ? "Platform default" : vendors.data?.find((v) => v.id === id)?.business_name ?? id;
  const zoneName = (id: string | null) =>
    id == null ? "All zones" : zones.data?.find((z) => z.id === id)?.name ?? id;

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Shipping Rates</h1>
            <p className="text-sm text-muted-foreground">
              Platform-default and vendor-specific rates offered at checkout.
            </p>
          </div>
        </div>
        <Link href="/settings/shipping-rates/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" /> New shipping rate
          </Button>
        </Link>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Vendor</label>
            <Select
              value={filters.vendor_id ?? "__all__"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, vendor_id: v === "__all__" ? undefined : v }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="platform">Platform default</SelectItem>
                {vendors.data?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.business_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Zone</label>
            <Select
              value={filters.zone_id ?? "__all__"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, zone_id: v === "__all__" ? undefined : v }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="any">All zones (null)</SelectItem>
                {zones.data?.map((z) => (
                  <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Method</label>
            <Input
              placeholder="e.g. standard"
              value={filters.method ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, method: e.target.value || undefined }))
              }
            />
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
              <SelectTrigger><SelectValue /></SelectTrigger>
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
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Zone</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Base</th>
                <th className="px-4 py-3 font-medium">Free above</th>
                <th className="px-4 py-3 font-medium">ETA</th>
                <th className="px-4 py-3 font-medium">Sort</th>
                <th className="px-4 py-3 font-medium text-right">Active</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                [1, 2, 3].map((i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))}
              {isError && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center">
                    <p className="text-destructive mb-2">Failed to load shipping rates.</p>
                    <button onClick={() => refetch()} className="text-primary hover:underline text-sm">
                      Retry
                    </button>
                  </td>
                </tr>
              )}
              {!isLoading && !isError && data?.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No shipping rates.{" "}
                    <Link href="/settings/shipping-rates/new" className="text-primary hover:underline">
                      Create the first one.
                    </Link>
                  </td>
                </tr>
              )}
              {data?.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-4 py-4 font-medium">{r.name}</td>
                  <td className="px-4 py-4">{vendorName(r.vendor_id)}</td>
                  <td className="px-4 py-4">{zoneName(r.zone_id)}</td>
                  <td className="px-4 py-4"><MethodBadge method={r.method} /></td>
                  <td className="px-4 py-4">{formatAed(r.base_cost)}</td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {r.free_above == null ? "—" : formatAed(r.free_above)}
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {r.estimated_days_min == null || r.estimated_days_max == null
                      ? "—"
                      : `${r.estimated_days_min}–${r.estimated_days_max} d`}
                  </td>
                  <td className="px-4 py-4">{r.sort_order}</td>
                  <td className="px-4 py-4 text-right">
                    <ActiveToggle rate={r} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/settings/shipping-rates/${r.id}`}
                        aria-label="Edit rate"
                        className="p-1 rounded hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <DeleteButton id={r.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.length > 0 && (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              Total: {data.length} shipping rate{data.length === 1 ? "" : "s"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
