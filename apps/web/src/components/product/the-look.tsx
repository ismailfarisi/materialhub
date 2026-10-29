"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface TheLookProps {
  shades?: Array<{ name: string; hex: string; swatch_url?: string }>;
  finish_type?: string;
  coverage_level?: number;
  wear_time?: string;
  pairs_with?: Array<{ id: string; name: string; image_url?: string }>;
}

function LevelBar({ value, max = 4, labels }: { value: number; max?: number; labels: string[] }) {
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} className={cn("h-2 flex-1 rounded-full transition-all", i < value ? "bg-copper" : "bg-warm")} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        {labels.map((l) => (<span key={l}>{l}</span>))}
      </div>
    </div>
  );
}

export function TheLook({ shades, finish_type, coverage_level, wear_time }: TheLookProps) {
  const [selectedShade, setSelectedShade] = useState<string | null>(null);

  return (
    <section className="py-12 md:py-16">
      <div className="container">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-center mb-10">The Look</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {shades && shades.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide mb-3">Find Your Shade</h3>
              <div className="flex flex-wrap gap-2">
                {shades.map((shade) => (
                  <button
                    key={shade.name}
                    onClick={() => setSelectedShade(shade.name)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-all",
                      selectedShade === shade.name ? "border-copper ring-2 ring-copper/30 scale-110" : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: shade.hex }}
                    title={shade.name}
                  />
                ))}
              </div>
              {selectedShade && <p className="text-sm text-copper font-medium mt-2">{selectedShade}</p>}
            </div>
          )}
          <div className="space-y-5">
            {finish_type && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide mb-2">Finish</h3>
                <div className="flex gap-2">
                  {["Matte", "Satin", "Dewy", "Shimmer"].map((f) => (
                    <span key={f} className={cn(
                      "px-3 py-1.5 rounded-full text-sm border",
                      f === finish_type ? "bg-copper/10 text-copper border-copper/20 font-medium" : "bg-warm/50 text-muted-foreground border-border"
                    )}>{f}</span>
                  ))}
                </div>
              </div>
            )}
            {coverage_level != null && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide mb-2">Coverage</h3>
                <LevelBar value={coverage_level} labels={["Sheer", "Light", "Medium", "Full"]} />
              </div>
            )}
            {wear_time && (
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide mb-2">Wear Time</h3>
                <p className="text-sm font-medium text-copper">{wear_time}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
