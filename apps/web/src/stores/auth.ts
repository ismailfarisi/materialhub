import { create } from "zustand";
import { markAuthSessionGuest, setAuthSessionHint } from "@/lib/api";

interface User {
  id: string;
  email: string;
  phone?: string | null;
  phone_verified_at?: string | null;
  first_name: string;
  last_name: string;
  role: string;
  avatar_url?: string;
  preferred_locale?: string;
  preferred_currency?: string;
  beauty_profile_completed?: boolean;
  creator_tier?: "regular" | "creator" | "influencer";
  creator_tier_earned_at?: string | null;
  can_tag_unowned?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => {
    if (user) setAuthSessionHint();
    set({ user, isAuthenticated: !!user, isLoading: false });
  },
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    markAuthSessionGuest();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));
