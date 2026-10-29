"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { HeaderNavTab } from "./types";

interface Props {
	onAdd: (tab: HeaderNavTab) => void;
	disabled: boolean;
}

interface CategoryRow {
	id: string;
	name: string;
	slug: string;
	children?: CategoryRow[];
}

interface FlatCategoryRow {
	id: string;
	name: string;
	slug: string;
	depth: number;
	parentName?: string;
}

function flattenForPicker(tree: CategoryRow[]): FlatCategoryRow[] {
	const out: FlatCategoryRow[] = [];
	for (const top of tree) {
		out.push({ id: top.id, name: top.name, slug: top.slug, depth: 0 });
		for (const child of top.children ?? []) {
			out.push({
				id: child.id,
				name: child.name,
				slug: child.slug,
				depth: 1,
				parentName: top.name,
			});
		}
	}
	return out;
}

export function AddTabDropdown({ onAdd, disabled }: Props) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<"none" | "category" | "custom">("none");
	const [customLabel, setCustomLabel] = useState("");
	const [customHref, setCustomHref] = useState("");
	const [query, setQuery] = useState("");

	const { data: categories } = useQuery({
		queryKey: ["categories-flat-l2"],
		queryFn: async () => {
			const { data } = await api.get<{ data: CategoryRow[] }>(
				"/categories/tree?depth=2",
			);
			return flattenForPicker(data.data ?? []);
		},
		enabled: open && mode === "category",
	});

	function makeBlankTab(): Omit<
		HeaderNavTab,
		"id" | "kind" | "category_id" | "href_override" | "label"
	> {
		return {
			show_subcategories: true,
			enabled: true,
			position: 0,
			brand_list: {
				title: { en: "New in Brands" },
				see_all_href: "/",
				brand_ids: [],
			},
			promo_tiles: [],
		};
	}

	const filtered = useMemo(() => {
		const all = categories ?? [];
		const q = query.trim().toLowerCase();
		if (!q) return all;
		// Match by category name OR by parent name (so typing "beauty" surfaces
		// every L2 under Health & Beauty). When a child matches via its parent,
		// the parent isn't auto-included — keeps results tight.
		return all.filter(
			(c) =>
				c.name.toLowerCase().includes(q) ||
				(c.parentName?.toLowerCase().includes(q) ?? false),
		);
	}, [categories, query]);

	function addCategoryTab(cat: FlatCategoryRow) {
		onAdd({
			...makeBlankTab(),
			id: crypto.randomUUID(),
			kind: "category",
			category_id: cat.id,
			href_override: null,
			label: { en: cat.name },
		});
		setOpen(false);
		setMode("none");
	}

	function addCustomTab() {
		if (!customLabel || !customHref) return;
		onAdd({
			...makeBlankTab(),
			id: crypto.randomUUID(),
			kind: "custom",
			category_id: null,
			href_override: customHref,
			label: { en: customLabel },
		});
		setOpen(false);
		setMode("none");
		setCustomLabel("");
		setCustomHref("");
	}

	if (!open) {
		return (
			<button
				type="button"
				disabled={disabled}
				onClick={() => setOpen(true)}
				className="flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.22em] text-nl-russet hover:text-nl-cacao disabled:opacity-40"
			>
				<Plus className="h-3.5 w-3.5" /> Add tab
			</button>
		);
	}

	return (
		<div className="border border-nl-cacao/15 p-3 space-y-2">
			{mode === "none" && (
				<div className="space-y-1">
					<button
						type="button"
						onClick={() => setMode("category")}
						className="block w-full text-left text-sm hover:bg-nl-pearl/40 px-2 py-1"
					>
						Link to category…
					</button>
					<button
						type="button"
						onClick={() => setMode("custom")}
						className="block w-full text-left text-sm hover:bg-nl-pearl/40 px-2 py-1"
					>
						Custom tab
					</button>
					<button
						type="button"
						onClick={() => setOpen(false)}
						className="text-xs text-nl-russet"
					>
						Cancel
					</button>
				</div>
			)}

			{mode === "category" && (
				<div className="space-y-2">
					<div className="flex items-center gap-2 border border-nl-cacao/20 px-2 py-1.5">
						<Search className="h-3.5 w-3.5 text-nl-russet" strokeWidth={1.25} />
						<input
							type="text"
							placeholder="Search categories…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							autoFocus
							className="flex-1 bg-transparent text-sm text-nl-cacao outline-none placeholder:text-nl-russet/50"
						/>
					</div>
					<div className="space-y-0.5 max-h-72 overflow-y-auto">
						{filtered.length === 0 ? (
							<div className="px-2 py-2 text-xs text-nl-russet/70">
								No categories match &ldquo;{query}&rdquo;
							</div>
						) : (
							filtered.map((c) => (
								<button
									key={c.id}
									type="button"
									onClick={() => addCategoryTab(c)}
									className={`block w-full text-left text-sm hover:bg-nl-pearl/40 px-2 py-1 ${
										c.depth === 1
											? "ps-6 text-nl-russet"
											: "font-medium text-nl-cacao"
									}`}
								>
									{c.depth === 1 && (
										<span className="text-nl-russet/50 me-1.5">↳</span>
									)}
									{c.name}
									{query && c.parentName && c.depth === 1 && (
										<span className="text-nl-russet/40 text-xs ms-1.5">
											· {c.parentName}
										</span>
									)}
								</button>
							))
						)}
					</div>
				</div>
			)}

			{mode === "custom" && (
				<div className="space-y-2">
					<input
						type="text"
						placeholder="Label (EN)"
						value={customLabel}
						onChange={(e) => setCustomLabel(e.target.value)}
						className="w-full border border-nl-cacao/20 px-2 py-1.5 text-sm"
					/>
					<input
						type="text"
						placeholder="URL (e.g. /promotions/new)"
						value={customHref}
						onChange={(e) => setCustomHref(e.target.value)}
						className="w-full border border-nl-cacao/20 px-2 py-1.5 text-sm"
					/>
					<button
						type="button"
						onClick={addCustomTab}
						disabled={!customLabel || !customHref}
						className="bg-nl-cacao text-nl-linen px-3 py-1.5 text-xs uppercase tracking-[0.22em] disabled:opacity-40"
					>
						Add
					</button>
				</div>
			)}
		</div>
	);
}
