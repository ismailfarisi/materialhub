"use client";

import { useState } from "react";
import { Button, Input } from "@materialhub/ui";
import { Plus } from "lucide-react";

export interface AttributeValueQuickAddProps {
  attributeType: string;
  busy: boolean;
  onSubmit: (body: {
    value: string;
    display_value?: string;
    color_hex?: string | null;
  }) => Promise<void>;
}

export function AttributeValueQuickAdd({
  attributeType,
  busy,
  onSubmit,
}: AttributeValueQuickAddProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [colorHex, setColorHex] = useState("");

  function reset() {
    setValue("");
    setDisplayValue("");
    setColorHex("");
    setOpen(false);
  }

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      await onSubmit({
        value: trimmed,
        display_value: displayValue.trim() || undefined,
        color_hex: attributeType === "color" ? colorHex.trim() || null : undefined,
      });
      reset();
    } catch {
      // Toast surfaced by caller; keep row open with input preserved
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-taupe hover:text-cacao"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        <Plus size={12} className="mr-1" /> Add value
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 p-2 rounded-md border border-dashed border-gray-300 bg-pearl/30">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 text-xs w-32"
        placeholder="Value"
        autoFocus
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
      />
      <Input
        value={displayValue}
        onChange={(e) => setDisplayValue(e.target.value)}
        className="h-7 text-xs w-32"
        placeholder="Display label"
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
      />
      {attributeType === "color" && (
        <Input
          value={colorHex}
          onChange={(e) => setColorHex(e.target.value)}
          className="h-7 text-xs w-24"
          placeholder="#RRGGBB"
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
      )}
      <Button
        type="button"
        size="sm"
        className="h-7 text-xs"
        disabled={busy || !value.trim()}
        onClick={handleSave}
      >
        {busy ? "..." : "Save"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        onClick={reset}
        disabled={busy}
      >
        Cancel
      </Button>
    </div>
  );
}
