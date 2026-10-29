"use client";

import { usePreferencesStore } from "@/stores/preferences";

const currencies = ["AED"];

export function CurrencySelector() {
  const { currency, setCurrency } = usePreferencesStore();

  return (
    <select
      value={currency}
      onChange={(e) => setCurrency(e.target.value)}
      className="bg-transparent text-xs appearance-none cursor-pointer outline-none pr-1 opacity-80 hover:opacity-100 transition-opacity"
    >
      {currencies.map((c) => (
        <option key={c} value={c} className="text-foreground bg-background">
          {c}
        </option>
      ))}
    </select>
  );
}
