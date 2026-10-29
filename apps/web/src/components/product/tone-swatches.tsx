"use client";

import { cn } from "@/lib/utils";

export type ToneSwatch = {
  id: string;
  /** Either a CSS gradient (`linear-gradient(...)`) or a swatch image URL prefixed with `url(...)`. */
  background: string;
  label?: string;
};

interface ToneSwatchesProps {
  tones: ToneSwatch[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** When the product has no tone variants, the parent should not render this. */
}

export function ToneSwatches({ tones, selectedId, onSelect }: ToneSwatchesProps) {
  if (!tones?.length) return null;
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {tones.map((t) => {
        const selected = selectedId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect?.(t.id)}
            aria-label={t.label ?? `Variant ${t.id}`}
            aria-pressed={selected}
            className={cn(
              "aspect-square w-full transition-colors",
              "border",
              selected ? "border-nl-cacao" : "border-transparent hover:border-nl-russet/40",
            )}
            style={{ background: t.background }}
          />
        );
      })}
    </div>
  );
}
