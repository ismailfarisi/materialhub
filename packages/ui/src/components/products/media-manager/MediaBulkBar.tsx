"use client";

import { Trash, X } from "@phosphor-icons/react";

interface Props {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}

export function MediaBulkBar({ count, onDelete, onClear }: Props) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 z-10 mx-auto max-w-md rounded-full bg-cacao text-linen shadow-xl ring-1 ring-cacao/40 px-2 py-1.5 flex items-center gap-2">
      <span className="px-3 text-sm font-medium">
        {count} <span className="text-linen/70">selected</span>
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-full text-red-200 hover:bg-russet/40 hover:text-red-100 transition-colors"
      >
        <Trash size={14} weight="bold" />
        Delete
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        title="Clear selection"
        className="ml-auto text-linen/70 hover:text-linen rounded-full p-1.5 hover:bg-white/10 transition-colors"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
