"use client";

import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";

interface Props {
  variants: { id: string; name: string }[];
  currentVariantId: string | null;
  onAssign: (variantId: string | null) => void;
  children: React.ReactNode;
}

export function MediaVariantAssign({ variants, currentVariantId, onAssign, children }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        <Button
          variant={currentVariantId === null ? "default" : "ghost"}
          size="sm"
          className="w-full justify-start"
          onClick={() => onAssign(null)}
        >
          All variants
        </Button>
        {variants.map((v) => (
          <Button
            key={v.id}
            variant={currentVariantId === v.id ? "default" : "ghost"}
            size="sm"
            className="w-full justify-start"
            onClick={() => onAssign(v.id)}
          >
            {v.name}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
