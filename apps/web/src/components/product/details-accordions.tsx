"use client";

import { Minus, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";

export type AccordionItem = {
  id: string;
  label: string;
  body: ReactNode;
  /** When true, this item is open on first render. */
  defaultOpen?: boolean;
};

interface DetailsAccordionsProps {
  items: AccordionItem[];
}

export function DetailsAccordions({ items }: DetailsAccordionsProps) {
  const initial = items.find((i) => i.defaultOpen)?.id ?? null;
  const [open, setOpen] = useState<string | null>(initial);
  if (!items.length) return null;

  return (
    <div>
      {items.map((item, i) => {
        const isOpen = open === item.id;
        return (
          <div
            key={item.id}
            className={
              i === 0 ? "border-t border-b border-nl-cacao/15" : "border-b border-nl-cacao/15"
            }
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              aria-controls={`acc-panel-${item.id}`}
              className="w-full py-5 flex items-center justify-between font-serif text-xl text-nl-cacao tracking-tight"
            >
              <span>{item.label}</span>
              {isOpen ? (
                <Minus className="w-5 h-5 text-nl-russet" aria-hidden="true" />
              ) : (
                <Plus className="w-5 h-5 text-nl-russet" aria-hidden="true" />
              )}
            </button>
            {isOpen && (
              <section
                id={`acc-panel-${item.id}`}
                aria-label={item.label}
                className="pb-7 max-w-[760px] text-sm leading-relaxed text-nl-russet"
              >
                {item.body}
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}
