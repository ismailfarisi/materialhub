"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import type { HeaderNavBrandList } from "./types";

interface Props {
	value: HeaderNavBrandList;
	onChange: (next: HeaderNavBrandList) => void;
}

const LOCALES = ["en", "ar", "hi", "ml", "ur"] as const;

export function BrandListEditor({ value, onChange }: Props) {
	const [search, setSearch] = useState("");
	const { data: searchResults } = useQuery({
		queryKey: ["brand-search", search],
		queryFn: async () => {
			if (search.length < 2) return [];
			const { data } = await api.get<{ data: { id: string; name: string }[] }>(
				`/brands?q=${encodeURIComponent(search)}&limit=10`,
			);
			return data.data ?? [];
		},
		enabled: search.length >= 2,
	});

	const { data: currentBrands = [] } = useQuery({
		queryKey: ["brands-by-ids", value.brand_ids],
		queryFn: async () => {
			if (value.brand_ids.length === 0) return [];
			const { data } = await api.get<{ data: { id: string; name: string }[] }>(
				`/brands?ids=${value.brand_ids.join(",")}`,
			);
			return data.data ?? [];
		},
	});

	function addBrand(id: string) {
		if (value.brand_ids.includes(id) || value.brand_ids.length >= 10) return;
		onChange({ ...value, brand_ids: [...value.brand_ids, id] });
		setSearch("");
	}
	function removeBrand(id: string) {
		onChange({ ...value, brand_ids: value.brand_ids.filter((x) => x !== id) });
	}

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 gap-2">
				{LOCALES.map((loc) => (
					<label key={loc} className="block">
						<span className="text-xs uppercase tracking-[0.18em] text-nl-russet">
							title — {loc}
						</span>
						<input
							type="text"
							value={value.title[loc] ?? ""}
							onChange={(e) =>
								onChange({
									...value,
									title: { ...value.title, [loc]: e.target.value },
								})
							}
							className="mt-1 w-full border border-nl-cacao/20 px-2 py-1.5 text-sm"
						/>
					</label>
				))}
			</div>
			<label className="block">
				<span className="text-xs uppercase tracking-[0.18em] text-nl-russet">
					See-all URL
				</span>
				<input
					type="text"
					value={value.see_all_href}
					onChange={(e) => onChange({ ...value, see_all_href: e.target.value })}
					placeholder="/brands?category=..."
					className="mt-1 w-full border border-nl-cacao/20 px-2 py-1.5 text-sm"
				/>
			</label>

			<div>
				<div className="text-xs uppercase tracking-[0.18em] text-nl-russet mb-1">
					Brands ({value.brand_ids.length}/10)
				</div>
				<ul className="list-none m-0 p-0 space-y-1 mb-2">
					{currentBrands.map((b) => (
						<li
							key={b.id}
							className="flex items-center justify-between px-2 py-1 bg-nl-pearl/40 text-sm"
						>
							<span>{b.name}</span>
							<button
								type="button"
								aria-label={`Remove ${b.name}`}
								onClick={() => removeBrand(b.id)}
							>
								<X className="h-3.5 w-3.5 text-nl-russet" />
							</button>
						</li>
					))}
				</ul>
				<div className="relative">
					<input
						type="text"
						placeholder="Search brand…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full border border-nl-cacao/20 px-2 py-1.5 text-sm"
					/>
					{search.length >= 2 && searchResults && searchResults.length > 0 && (
						<ul className="absolute z-10 inset-x-0 mt-1 bg-white border border-nl-cacao/20 max-h-44 overflow-y-auto list-none m-0 p-0">
							{searchResults.map((b) => (
								<li
									key={b.id}
									onClick={() => addBrand(b.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") addBrand(b.id);
									}}
									className="px-2 py-1.5 text-sm hover:bg-nl-pearl/60 cursor-pointer"
								>
									{b.name}
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
