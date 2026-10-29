"use client";

import { formatAed } from "@/lib/money";
import {
	type AdminProductSearchResult,
	useAdminProductSearch,
} from "@/lib/queries/gifting";
import { Button, Input } from "@materialhub/ui";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * A single item in the box being built. `unit_price` (fils) is best-effort:
 * known for products added via search (from the search payload) and for items
 * hydrated from an existing box; the authoritative price always comes from the
 * server after save.
 */
export interface PickerItem {
	product_id: string;
	variant_id: string | null;
	quantity: number;
	/** Unit price in fils, if known client-side. */
	unit_price: number | null;
	/** Display label (product name), best-effort. */
	name: string;
	image_url: string | null;
}

export function BoxItemPicker({
	items,
	onChange,
	maxCapacity,
}: {
	items: PickerItem[];
	onChange: (items: PickerItem[]) => void;
	/** Selected style's capacity; null = unlimited. */
	maxCapacity: number | null;
}) {
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>();

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => setDebounced(query), 250);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query]);

	useEffect(() => {
		function onDoc(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", onDoc);
		return () => document.removeEventListener("mousedown", onDoc);
	}, []);

	const { data: results = [], isFetching } = useAdminProductSearch(debounced);

	const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);
	const overCapacity = maxCapacity != null && totalQty > maxCapacity;
	const atCapacity = maxCapacity != null && totalQty >= maxCapacity;
	const capacityPct =
		maxCapacity && maxCapacity > 0
			? Math.min(100, (totalQty / maxCapacity) * 100)
			: 0;

	function addProduct(p: AdminProductSearchResult) {
		const existing = items.find(
			(it) => it.product_id === p.id && !it.variant_id,
		);
		if (existing) {
			onChange(
				items.map((it) =>
					it === existing ? { ...it, quantity: it.quantity + 1 } : it,
				),
			);
		} else {
			onChange([
				...items,
				{
					product_id: p.id,
					variant_id: null,
					quantity: 1,
					unit_price: p.price ?? null,
					name: p.name,
					image_url: p.image_url,
				},
			]);
		}
		setQuery("");
		setOpen(false);
	}

	function setQuantity(index: number, qty: number) {
		if (!Number.isFinite(qty) || qty < 1) return;
		onChange(
			items.map((it, i) => (i === index ? { ...it, quantity: qty } : it)),
		);
	}

	function removeItem(index: number) {
		onChange(items.filter((_, i) => i !== index));
	}

	return (
		<div className="space-y-4">
			{/* Capacity meter */}
			<div>
				<div className="mb-1 flex items-center justify-between text-sm">
					<span className="font-medium text-cacao">Capacity</span>
					<span
						className={
							overCapacity
								? "font-medium text-red-600"
								: atCapacity
									? "font-medium text-amber-600"
									: "text-taupe"
						}
					>
						{totalQty}
						{maxCapacity != null ? ` / ${maxCapacity}` : " items"}
						{overCapacity && " — over capacity"}
					</span>
				</div>
				{maxCapacity != null && (
					<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
						<div
							className={`h-full transition-all ${
								overCapacity
									? "bg-red-500"
									: atCapacity
										? "bg-amber-500"
										: "bg-primary"
							}`}
							style={{ width: `${overCapacity ? 100 : capacityPct}%` }}
						/>
					</div>
				)}
			</div>

			{/* Product search */}
			<div ref={containerRef} className="relative">
				<label className="mb-1 block text-sm font-medium text-cacao">
					Add product
				</label>
				<Input
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					placeholder={
						atCapacity
							? "Box is full — remove an item to add more"
							: "Search products by name…"
					}
					disabled={atCapacity}
				/>
				{open && !atCapacity && (
					<div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg">
						<div className="max-h-64 overflow-y-auto p-1">
							{isFetching ? (
								<div className="flex items-center justify-center py-6 text-muted-foreground">
									<Loader2 size={16} className="animate-spin" />
								</div>
							) : results.length === 0 ? (
								<div className="px-3 py-6 text-center text-sm text-muted-foreground">
									{debounced.length > 0 && debounced.length < 2
										? "Type at least 2 characters…"
										: "No products found"}
								</div>
							) : (
								results.map((p) => (
									<button
										key={p.id}
										type="button"
										onClick={() => addProduct(p)}
										className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted/60"
									>
										{p.image_url ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={p.image_url}
												alt=""
												className="h-8 w-8 rounded object-cover"
											/>
										) : (
											<div className="h-8 w-8 rounded bg-muted" />
										)}
										<div className="min-w-0 flex-1">
											<div className="truncate">{p.name}</div>
											<div className="truncate text-xs text-muted-foreground">
												{p.vendor_name ? `${p.vendor_name} · ` : ""}
												{formatAed(p.price)}
											</div>
										</div>
										<Plus size={15} className="shrink-0 text-primary" />
									</button>
								))
							)}
						</div>
					</div>
				)}
			</div>

			{/* Current items */}
			<div>
				<label className="mb-1 block text-sm font-medium text-cacao">
					{items.length} product(s) in this box
				</label>
				{items.length === 0 ? (
					<div className="py-3 text-sm text-muted-foreground">
						No products yet.
					</div>
				) : (
					<div className="space-y-1.5">
						{items.map((it, i) => (
							<div
								key={`${it.product_id}-${it.variant_id ?? "base"}`}
								className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
							>
								{it.image_url ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img
										src={it.image_url}
										alt=""
										className="h-8 w-8 rounded object-cover"
									/>
								) : (
									<div className="h-8 w-8 rounded bg-muted" />
								)}
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm">{it.name}</div>
									<div className="truncate text-xs text-muted-foreground">
										{it.unit_price != null
											? formatAed(it.unit_price)
											: "price on save"}
									</div>
								</div>
								<Input
									type="number"
									min={1}
									value={it.quantity}
									onChange={(e) => setQuantity(i, Number(e.target.value))}
									className="w-16"
									aria-label="Quantity"
								/>
								<button
									type="button"
									onClick={() => removeItem(i)}
									className="text-muted-foreground hover:text-red-600"
									aria-label="Remove"
								>
									<Trash2 size={15} />
								</button>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
