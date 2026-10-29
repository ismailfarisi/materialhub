"use client";

import { Plus, X } from "lucide-react";
import { useId } from "react";
import type { HeaderNavPromoTile } from "./types";

interface Props {
	tiles: HeaderNavPromoTile[];
	onChange: (next: HeaderNavPromoTile[]) => void;
}

const LOCALES = ["en", "ar", "hi", "ml", "ur"] as const;
const MAX = 3;

export function PromoTileEditor({ tiles, onChange }: Props) {
	function addTile() {
		if (tiles.length >= MAX) return;
		onChange([
			...tiles,
			{
				id: crypto.randomUUID(),
				image_url: "",
				title: { en: "" },
				cta_text: { en: "Shop now" },
				href: "/",
			},
		]);
	}
	function updateTile(idx: number, next: HeaderNavPromoTile) {
		const copy = [...tiles];
		copy[idx] = next;
		onChange(copy);
	}
	function removeTile(idx: number) {
		onChange(tiles.filter((_, i) => i !== idx));
	}

	return (
		<div className="space-y-4">
			{tiles.map((tile, idx) => (
				<div key={tile.id} className="border border-nl-cacao/15 p-3 space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-xs uppercase tracking-[0.18em] text-nl-russet">
							Tile {idx + 1}
						</span>
						<button
							type="button"
							aria-label="Remove tile"
							onClick={() => removeTile(idx)}
						>
							<X className="h-3.5 w-3.5 text-nl-russet" />
						</button>
					</div>
					<ImageInput
						value={tile.image_url}
						onChange={(image_url) => updateTile(idx, { ...tile, image_url })}
					/>
					<LocaleField
						label="Title"
						value={tile.title}
						onChange={(title) => updateTile(idx, { ...tile, title })}
					/>
					<LocaleField
						label="CTA text"
						value={tile.cta_text}
						onChange={(cta_text) => updateTile(idx, { ...tile, cta_text })}
					/>
					<label className="block">
						<span className="text-xs uppercase tracking-[0.18em] text-nl-russet">
							Link URL
						</span>
						<input
							type="text"
							value={tile.href}
							onChange={(e) =>
								updateTile(idx, { ...tile, href: e.target.value })
							}
							className="mt-1 w-full border border-nl-cacao/20 px-2 py-1.5 text-sm"
						/>
					</label>
				</div>
			))}
			{tiles.length < MAX && (
				<button
					type="button"
					onClick={addTile}
					className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.22em] text-nl-russet hover:text-nl-cacao"
				>
					<Plus className="h-3.5 w-3.5" /> Add tile
				</button>
			)}
		</div>
	);
}

function ImageInput({
	value,
	onChange,
}: { value: string; onChange: (url: string) => void }) {
	const id = useId();
	return (
		<label htmlFor={id} className="block">
			<span className="text-xs uppercase tracking-[0.18em] text-nl-russet">
				Image URL
			</span>
			<input
				id={id}
				type="text"
				value={value}
				placeholder="https://cdn..../image.jpg"
				onChange={(e) => onChange(e.target.value)}
				className="mt-1 w-full border border-nl-cacao/20 px-2 py-1.5 text-sm"
			/>
		</label>
	);
}

function LocaleField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: { en: string; ar?: string; hi?: string; ml?: string; ur?: string };
	onChange: (next: {
		en: string;
		ar?: string;
		hi?: string;
		ml?: string;
		ur?: string;
	}) => void;
}) {
	return (
		<div>
			<span className="text-xs uppercase tracking-[0.18em] text-nl-russet">
				{label}
			</span>
			<div className="mt-1 grid grid-cols-2 gap-2">
				{LOCALES.map((loc) => (
					<input
						key={loc}
						type="text"
						placeholder={loc.toUpperCase()}
						value={value[loc] ?? ""}
						onChange={(e) => onChange({ ...value, [loc]: e.target.value })}
						className="border border-nl-cacao/20 px-2 py-1.5 text-sm"
					/>
				))}
			</div>
		</div>
	);
}
