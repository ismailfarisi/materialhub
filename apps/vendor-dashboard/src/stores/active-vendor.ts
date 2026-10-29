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
