import { create } from "zustand";
import { persist } from "zustand/middleware";

const supportedLocales = ["en", "ar"];

interface PreferencesState {
  locale: string;
  currency: string;
  setLocale: (locale: string) => void;
  setCurrency: (currency: string) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: "en",
      currency: "AED",
      setLocale: (locale) => set({ locale: supportedLocales.includes(locale) ? locale : "en" }),
      setCurrency: () => set({ currency: "AED" }),
    }),
    {
      name: "materialhub-preferences",
    }
  )
);
