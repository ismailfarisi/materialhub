import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChatState {
  isOpen: boolean;
  activeTicketId: string | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setActiveTicket: (id: string | null) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      isOpen: false,
      activeTicketId: null,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setActiveTicket: (id) => set({ activeTicketId: id }),
    }),
    { name: "materialhub-chat", partialize: (s) => ({ activeTicketId: s.activeTicketId }) },
  ),
);
