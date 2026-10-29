"use client";

import { cn, formatPrice } from "@/lib/utils";

export type Format = {
  /** Variant id used by cart mutations. */
  id: string;
  /** e.g. "30 ml", "50 g", "1.7 fl oz" — generic across categories. */
  label: string;
  /** Price in fils. */
  price_fils: number;
};

interface FormatSelectorProps {
  formats: Format[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  currency?: string;
  /** Optional eyebrow note shown above the selector (e.g. "Refillable from 50 ml up"). */
  eyebrowNote?: string;
  /** Variant ids with no available stock — rendered muted with a "Sold out" tag. */
  outOfStockIds?: Set<string>;
}

export function FormatSelector({
  formats,
  selectedId,
  onSelect,
  currency = "AED",
  eyebrowNote,
  outOfStockIds,
}: FormatSelectorProps) {
  if (!formats?.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] tracking-[0.22em] uppercase text-nl-russet">Format</span>
        {eyebrowNote && (
          <span className="text-[11px] italic font-serif text-nl-russet">{eyebrowNote}</span>
        )}
      </div>
      <div className="flex gap-2.5">
        {formats.map((f) => {
          const selected = selectedId === f.id;
          const soldOut = outOfStockIds?.has(f.id) ?? false;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect?.(f.id)}
              aria-pressed={selected}
              className={cn(
                "flex-1 px-4 py-3.5 rounded-sm border transition-all duration-300",
                "flex flex-col gap-1 items-start",
                selected
                  ? "bg-nl-cacao text-nl-linen border-nl-cacao"
                  : "bg-transparent text-nl-cacao border-nl-cacao/25 hover:border-nl-cacao/60",
                soldOut && !selected && "opacity-50",
              )}
            >
              <span className="text-[11px] tracking-[0.18em] uppercase">{f.label}</span>
              {soldOut ? (
                <span className="text-[10px] tracking-[0.18em] uppercase opacity-80">
                  Sold out
                </span>
              ) : (
                <span className="text-sm font-serif">{formatPrice(f.price_fils, currency)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
