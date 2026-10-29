"use client";

import { cn } from "@/lib/utils";
import { type ReactNode, useState } from "react";

export type ProductTab = {
  id: string;
  label: string;
  /** Pre-rendered ReactNode (lets the parent decide layout per tab). */
  body: ReactNode;
};

interface NotesRitualCraftTabsProps {
  tabs: ProductTab[];
  initialId?: string;
}

export function NotesRitualCraftTabs({ tabs, initialId }: NotesRitualCraftTabsProps) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id);
  if (!tabs?.length) return null;
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="border-t border-nl-cacao/15 pt-6">
      <div role="tablist" className="flex gap-6 mb-5">
        {tabs.map((t) => {
          const selected = t.id === current.id;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              className={cn(
                "text-[10px] tracking-[0.22em] uppercase pb-1.5 border-b transition-colors",
                selected ? "text-nl-cacao border-nl-cacao" : "text-nl-cacao/40 border-transparent",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: tabpanel needs tabIndex=0 per WAI-ARIA tabs pattern so users can focus the panel via Tab
        tabIndex={0}
        className="min-h-[100px]"
      >
        {current.body}
      </div>
    </div>
  );
}
