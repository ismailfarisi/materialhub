"use client";

import { api } from "@/lib/api";
import { type VendorMembership, getMembershipsFromToken } from "@/lib/auth";
import {
  switchActiveVendor,
  syncActiveVendorWithMemberships,
  useActiveVendor,
} from "@/stores/active-vendor";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

interface VendorSummary {
  id: string;
  name: string | null;
}

/** Label for a membership: the store name, never a raw id. */
export function vendorOptionLabel(
  m: VendorMembership,
  vendors: VendorSummary[],
  index: number,
): string {
  const name = vendors.find((v) => v.id === m.vid)?.name?.trim();
  return `${name || `Store ${index + 1}`} — ${m.r}`;
}

export function VendorPicker() {
  // Read memberships after mount (document.cookie is client-only). `null`
  // means "not read yet": syncing against an empty list before the cookie is
  // read would wipe the persisted choice on every page load.
  const [memberships, setMemberships] = useState<VendorMembership[] | null>(null);
  useEffect(() => {
    setMemberships(getMembershipsFromToken());
  }, []);

  const activeVendorId = useActiveVendor((s) => s.activeVendorId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (memberships) syncActiveVendorWithMemberships(memberships);
  }, [memberships]);

  const list = memberships ?? [];
  // Store names. /vendors/:id/profile only serves approved stores and returns
  // `name`; a store it can't serve falls back to "Store N".
  const { data: vendors = [] } = useQuery<VendorSummary[]>({
    queryKey: ["vendor-picker:vendors", list.map((m) => m.vid).join(",")],
    queryFn: async () =>
      Promise.all(
        list.map(async (m) => {
          try {
            const res = await api.get<{ data: { id: string; name: string } }>(
              `/vendors/${m.vid}/profile`,
            );
            return { id: m.vid, name: res.data.data?.name ?? null };
          } catch {
            return { id: m.vid, name: null };
          }
        }),
      ),
    enabled: list.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  if (list.length < 2) return null;

  return (
    <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
      <span className="hidden shrink-0 text-muted-foreground sm:inline">Store</span>
      <select
        className="min-w-0 max-w-full truncate rounded border border-pearl bg-linen px-3 py-1.5 text-sm sm:max-w-xs"
        value={activeVendorId ?? ""}
        onChange={(e) => switchActiveVendor(e.target.value, queryClient)}
        aria-label="Active store"
      >
        {list.map((m, i) => (
          <option key={m.vid} value={m.vid}>
            {vendorOptionLabel(m, vendors, i)}
          </option>
        ))}
      </select>
    </label>
  );
}
