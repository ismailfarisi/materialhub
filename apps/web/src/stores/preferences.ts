import { create } from "zustand";
import { persist } from "zustand/middleware";

const supportedLocales = ["en", "ar"];

interface PreferencesState {
  locale: string;
  currency: string;
  /** Destination emirate for delivery estimates when no address is known. */
  deliveryEmirate: string | null;
  setDeliveryEmirate: (emirate: string | null) => void;
  setLocale: (locale: string) => void;
  setCurrency: (currency: string) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: "en",
      currency: "AED",
      deliveryEmirate: null,
      setDeliveryEmirate: (deliveryEmirate) => set({ deliveryEmirate }),
      setLocale: (locale) => set({ locale: supportedLocales.includes(locale) ? locale : "en" }),
      setCurrency: () => set({ currency: "AED" }),
    }),
    {
      name: "materialhub-preferences",
    }
  )
);
