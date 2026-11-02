"use client";

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

export type AccordionItem = {
	id: string;
	label: string;
	body: ReactNode;
	/** When true, this item is open on first render. */
	defaultOpen?: boolean;
};

/**
 * Policy accordions (shipping, returns, guarantee). Specs never go in here:
 * they live in the mill label next to the price.
 */
export function DetailsAccordions({ items }: { items: AccordionItem[] }) {
	const initial = items.filter((i) => i.defaultOpen).map((i) => i.id);
	const [open, setOpen] = useState<string[]>(initial);
	const base = useId();
	if (!items.length) return null;

	return (
		<div className="border-t-2 border-nl-cacao">
			{items.map((item) => {
				const isOpen = open.includes(item.id);
				const panelId = `${base}-${item.id}`;
				return (
					<div key={item.id} className="border-b border-nl-cacao/12">
						<h3 className="m-0">
							<button
								type="button"
								onClick={() => setOpen((o) => (isOpen ? o.filter((x) => x !== item.id) : [...o, item.id]))}
								aria-expanded={isOpen}
								aria-controls={panelId}
								className="flex w-full items-center justify-between gap-4 py-4 text-start font-display text-[15.5px] font-semibold tracking-[-0.01em] text-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
							>
								<span>{item.label}</span>
								<Plus
									className={cn("h-4 w-4 shrink-0 text-nl-russet transition-transform duration-200 motion-reduce:transition-none", isOpen && "rotate-45")}
									strokeWidth={1.75}
									aria-hidden="true"
								/>
							</button>
						</h3>
						<div id={panelId} hidden={!isOpen} className="max-w-[70ch] pb-5 text-[14px] leading-relaxed text-nl-russet">
							{item.body}
						</div>
					</div>
				);
			})}
		</div>
	);
}
