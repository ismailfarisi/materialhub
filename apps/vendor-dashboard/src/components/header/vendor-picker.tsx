"use client";

import { useEffect, useState } from "react";
import { getMembershipsFromToken, type VendorMembership } from "@/lib/auth";
import { useActiveVendor, syncActiveVendorWithMemberships } from "@/stores/active-vendor";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface VendorSummary {
  id: string;
  business_name: string;
}

export function VendorPicker() {
  // Read memberships in a useState/useEffect to avoid hydration mismatch:
  // getMembershipsFromToken reads document.cookie which is only available client-side.
  const [memberships, setMemberships] = useState<VendorMembership[]>([]);
  useEffect(() => {
    setMemberships(getMembershipsFromToken());
  }, []);

  const activeVendorId = useActiveVendor((s) => s.activeVendorId);
  const setActiveVendorId = useActiveVendor((s) => s.setActiveVendorId);

  useEffect(() => {
    syncActiveVendorWithMemberships(memberships);
  }, [memberships]);

  // Fetch vendor names in parallel for each membership
  const { data: vendors = [] } = useQuery<VendorSummary[]>({
    queryKey: ["vendor-picker:vendors", memberships.map((m) => m.vid).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        memberships.map(async (m) => {
          const res = await api.get<{ data: { id: string; business_name: string } }>(
            `/vendors/${m.vid}/profile`,
          );
          return res.data.data;
        }),
      );
      return results;
    },
    enabled: memberships.length >= 2,
  });

  if (memberships.length < 2) return null;

  return (
    <select
      className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm"
      value={activeVendorId ?? ""}
      onChange={(e) => setActiveVendorId(e.target.value)}
      aria-label="Active vendor"
    >
      {memberships.map((m) => {
        const v = vendors.find((vv) => vv.id === m.vid);
        return (
          <option key={m.vid} value={m.vid}>
            {v?.business_name ?? m.vid} — {m.r}
          </option>
        );
      })}
    </select>
  );
}
