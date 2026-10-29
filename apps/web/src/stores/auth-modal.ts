import { create } from "zustand";

type AuthModalMode = "login" | "register";

interface AuthModalState {
  isOpen: boolean;
  mode: AuthModalMode;
  returnTo: string | null;
  open: (mode?: AuthModalMode, returnTo?: string | null) => void;
  setMode: (mode: AuthModalMode) => void;
  close: () => void;
}

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isOpen: false,
  mode: "login",
  returnTo: null,
  open: (mode = "login", returnTo = null) => set({ isOpen: true, mode, returnTo }),
  setMode: (mode) => set({ mode }),
  close: () => set({ isOpen: false, returnTo: null }),
}));
