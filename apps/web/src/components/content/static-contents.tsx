"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

interface Item {
	id: string;
	label: string;
}

/**
 * In-page contents for Read surfaces. Sticky rail at `lg` with the section in
 * view marked (`aria-current`); a collapsible list above the column below that.
 */
export function StaticContents({
	items,
	title,
	itemsLang,
}: { items: Item[]; title: string; itemsLang?: string }) {
	const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

	useEffect(() => {
		const els = items
			.map((i) => document.getElementById(i.id))
			.filter((el): el is HTMLElement => !!el);
		if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
		const visible = new Map<string, boolean>();
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) visible.set(e.target.id, e.isIntersecting);
				const first = items.find((i) => visible.get(i.id));
				if (first) setActive(first.id);
			},
			{ rootMargin: "-120px 0px -55% 0px" },
		);
		for (const el of els) io.observe(el);
		return () => io.disconnect();
	}, [items]);

	const list = () => (
		<ol className="list-none m-0 p-0 grid">
			{items.map((i) => {
				const on = active === i.id;
				return (
					<li key={i.id}>
						<a
							href={`#${i.id}`}
							aria-current={on ? "location" : undefined}
							className={cn(
								"block py-2 ps-3 -ms-px border-s-2 text-[14px] leading-snug transition-colors",
								on
									? "border-nl-cacao text-nl-cacao font-medium"
									: "border-transparent text-nl-russet hover:text-nl-cacao hover:border-nl-cacao/30",
							)}
						>
							{i.label}
						</a>
					</li>
				);
			})}
		</ol>
	);

	return (
		<>
			<details className="group lg:hidden mb-10 rounded-md bg-nl-pearl shadow-card">
				<summary className="flex items-center justify-between gap-3 h-12 px-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden rounded-md">
					<span className="mill-label text-nl-cacao">{title}</span>
					<ChevronDown
						className="h-4 w-4 text-nl-russet transition-transform group-open:rotate-180 motion-reduce:transition-none"
						strokeWidth={1.75}
						aria-hidden="true"
					/>
				</summary>
				<div className="px-4 pb-3 border-t border-nl-cacao/10 pt-2">
					<div className="border-s border-nl-cacao/12" lang={itemsLang} dir={itemsLang ? "ltr" : undefined}>
						{list()}
					</div>
				</div>
			</details>
			<nav aria-label={title} className="hidden lg:block">
				<div className="sticky top-32 grid gap-3">
					<span className="mill-label text-nl-russet">{title}</span>
					<div
						lang={itemsLang}
						dir={itemsLang ? "ltr" : undefined}
						className="border-s border-nl-cacao/12 max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-nl"
					>
						{list()}
					</div>
				</div>
			</nav>
		</>
	);
}
