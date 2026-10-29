import { create } from "zustand";

// Shared so both the header hamburger and the bottom tab bar can open the
// single MobileNavDrawer instance rendered by the Header.
interface MobileNavState {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useMobileNavStore = create<MobileNavState>((set) => ({
  drawerOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
