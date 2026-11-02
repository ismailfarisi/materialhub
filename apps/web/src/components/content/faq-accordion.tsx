import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export interface FaqItem {
	q: string;
	a: ReactNode;
}

/**
 * FAQ accordion built on native <details>/<summary>: keyboard and screen
 * reader support come from the platform, it works without JavaScript, and
 * find-in-page opens the matching answer. Ruled like a mill label.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
	return (
		<div className="not-prose border-t-2 border-nl-cacao max-w-[76ch]">
			{items.map((item) => (
				<details key={item.q} className="group border-b border-nl-cacao/12">
					<summary className="flex items-start justify-between gap-4 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[15px] md:text-base font-medium text-nl-cacao leading-snug rounded-sm hover:text-nl-cacao/80">
						<span>{item.q}</span>
						<span
							aria-hidden="true"
							className="grid place-items-center h-6 w-6 shrink-0 rounded-sm border border-nl-cacao/15 bg-nl-pearl transition-[transform,background-color,color] duration-200 ease-out group-open:rotate-45 group-open:bg-nl-cacao group-open:text-nl-pearl motion-reduce:transition-none"
						>
							<Plus className="h-3.5 w-3.5" strokeWidth={2} />
						</span>
					</summary>
					<div className="pb-5 pe-10 text-[15px] leading-[1.65] text-nl-cacao/85 [&_p]:max-w-[68ch] [&_p+p]:mt-3 [&_a]:underline [&_a]:decoration-nl-cacao/30 [&_a]:underline-offset-[0.2em] [&_a:hover]:decoration-nl-amber">
						{item.a}
					</div>
				</details>
			))}
		</div>
	);
}
