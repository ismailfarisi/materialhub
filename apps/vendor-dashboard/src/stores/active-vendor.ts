import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { VendorMembership } from "../lib/auth";

interface ActiveVendorStore {
  activeVendorId: string | null;
  setActiveVendorId: (vid: string) => void;
}

export const useActiveVendor = create<ActiveVendorStore>()(
  persist(
    (set) => ({
      activeVendorId: null,
      setActiveVendorId: (vid) => set({ activeVendorId: vid }),
    }),
    { name: "vendor-dashboard:active-vendor" },
  ),
);

/**
 * Reconcile the persisted activeVendorId with the user's current memberships.
 * - If memberships is empty, clear the selection.
 * - If the persisted id is no longer in memberships, fall back to memberships[0].
 * - Otherwise, leave as-is.
 *
 * Call this from a layout-level effect after memberships are read from the JWT.
 */
export function syncActiveVendorWithMemberships(memberships: VendorMembership[]): void {
  const state = useActiveVendor.getState();
  if (memberships.length === 0) {
    if (state.activeVendorId !== null) useActiveVendor.setState({ activeVendorId: null });
    return;
  }
  const valid = memberships.some((m) => m.vid === state.activeVendorId);
  if (!valid) {
    useActiveVendor.setState({ activeVendorId: memberships[0].vid });
  }
}

/** Query keys that don't depend on the active vendor and survive a switch. */
const VENDOR_INDEPENDENT_KEYS = new Set(["auth", "vendor-picker:vendors", "invite-preview"]);

/**
 * Switch the active vendor and drop every cached query that belongs to the
 * previous one, so pages refetch with the new X-Active-Vendor-Id header
 * instead of showing the old store's data.
 */
export function switchActiveVendor(vid: string, queryClient: QueryClient): void {
  if (useActiveVendor.getState().activeVendorId === vid) return;
  useActiveVendor.getState().setActiveVendorId(vid);
  const vendorScoped = (q: { queryKey: readonly unknown[] }) =>
    !VENDOR_INDEPENDENT_KEYS.has(String(q.queryKey[0]));
  queryClient.removeQueries({ predicate: vendorScoped, type: "inactive" });
  void queryClient.resetQueries({ predicate: vendorScoped, type: "active" });
}
