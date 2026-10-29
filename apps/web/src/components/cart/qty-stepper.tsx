"use client";

import { Minus, Plus } from "lucide-react";

export function QtyStepper({
  value,
  onChange,
  min = 1,
}: {
  value: number;
  onChange: (qty: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center border rounded">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="p-1 hover:bg-accent"
        disabled={value <= min}
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="px-3 text-sm">{value}</span>
      <button onClick={() => onChange(value + 1)} className="p-1 hover:bg-accent">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
