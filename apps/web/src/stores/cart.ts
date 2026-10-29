import { create } from "zustand";

interface CartState {
  itemCount: number;
  isSlideOverOpen: boolean;
  setItemCount: (count: number) => void;
  openSlideOver: () => void;
  closeSlideOver: () => void;
  toggleSlideOver: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  itemCount: 0,
  isSlideOverOpen: false,
  setItemCount: (itemCount) => set({ itemCount }),
  openSlideOver: () => set({ isSlideOverOpen: true }),
  closeSlideOver: () => set({ isSlideOverOpen: false }),
  toggleSlideOver: () =>
    set((state) => ({ isSlideOverOpen: !state.isSlideOverOpen })),
}));
