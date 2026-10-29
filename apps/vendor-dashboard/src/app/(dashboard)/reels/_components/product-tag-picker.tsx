"use client";

import {
	type TaggableProductRow,
	addReelTag,
	deleteReelTag,
	fetchTaggableProducts,
} from "@/lib/api/reels";
import { Button } from "@materialhub/ui";
import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

interface TaggedItem {
	id: string;
	product: { id: string; name: string; primary_image_url?: string | null };
	timestampSeconds: number;
}

interface Props {
	reelId: string;
	videoDurationSeconds: number;
	initialTags: TaggedItem[];
	onChange?: (tags: TaggedItem[]) => void;
}

function subtitleFor(row: TaggableProductRow): string {
	if (row.source === "vendor_owned") return "Your catalog";
	if (row.source === "permission") return "Tagging access";
	return [row.variant_label, row.delivered_at ? "Delivered product" : null]
		.filter(Boolean)
		.join(" · ");
}

export function ProductTagPicker({
	reelId,
	videoDurationSeconds,
	initialTags,
	onChange,
}: Props) {
	const [tags, setTags] = useState<TaggedItem[]>(initialTags);
	const [search, setSearch] = useState("");
	const [results, setResults] = useState<TaggableProductRow[]>([]);
	const [timestamp, setTimestamp] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const loadedDefaultRef = useRef(false);

	async function loadProducts(q: string) {
		setLoading(true);
		try {
			// Vendors tag from their full catalog — request the max so the default
			// (empty-query) list shows as many of their products as possible.
			const rows = await fetchTaggableProducts(q, 50);
			setResults(rows);
			setError(null);
		} catch {
			setResults([]);
			setError("Could not load products.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(
		() => () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		},
		[],
	);

	function handleSearch(next: string) {
		setSearch(next);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => loadProducts(next), 250);
	}

	async function pick(product: TaggableProductRow) {
		if (tags.length >= 5) {
			setError("Maximum of 5 tags per reel.");
			return;
		}
		if (timestamp > videoDurationSeconds) {
			setError("Timestamp exceeds video duration.");
			return;
		}
		setBusy(true);
		try {
			const tag = await addReelTag(reelId, {
				productId: product.product_id,
				timestampSeconds: timestamp,
			});
			const updated = [
				...tags,
				{
					id: tag.id,
					product: { id: product.product_id, name: product.name },
					timestampSeconds: timestamp,
				},
			];
			setTags(updated);
			onChange?.(updated);
			setSearch("");
			setOpen(false);
			setError(null);
		} catch (err: unknown) {
			const e = err as {
				response?: { data?: { error?: string } };
				message?: string;
			};
			setError(e?.response?.data?.error ?? e?.message ?? "Failed to add tag");
		} finally {
			setBusy(false);
		}
	}

	async function remove(tagId: string) {
		setBusy(true);
		try {
			await deleteReelTag(reelId, tagId);
			const updated = tags.filter((tag) => tag.id !== tagId);
			setTags(updated);
			onChange?.(updated);
		} catch (err: unknown) {
			const e = err as {
				response?: { data?: { error?: string } };
				message?: string;
			};
			setError(
				e?.response?.data?.error ?? e?.message ?? "Failed to remove tag",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div className="text-sm font-medium text-gray-900">
					Tagged products ({tags.length}/5)
				</div>
				<span className="text-xs text-muted-foreground">
					Publish requires at least one tag
				</span>
			</div>

			<div className="flex flex-wrap gap-2">
				{tags.map((tag) => (
					<span
						key={tag.id}
						className="inline-flex items-center gap-2 rounded-md bg-gray-100 px-3 py-1 text-sm"
					>
						{tag.product.name} @ {tag.timestampSeconds}s
						<button
							type="button"
							onClick={() => remove(tag.id)}
							disabled={busy}
							aria-label={`Remove ${tag.product.name}`}
						>
							<X size={14} />
						</button>
					</span>
				))}
			</div>

			{tags.length < 5 && (
				<div className="space-y-2">
					<div className="grid gap-2 sm:grid-cols-[120px_1fr]">
						<input
							type="number"
							min={0}
							max={videoDurationSeconds}
							step={0.5}
							value={timestamp}
							onChange={(event) => setTimestamp(Number(event.target.value))}
							className="rounded-md border border-pearl/30 px-3 py-2 text-sm"
							disabled={busy}
						/>
						<input
							type="text"
							value={search}
							onFocus={() => {
								setOpen(true);
								if (!loadedDefaultRef.current) {
									loadedDefaultRef.current = true;
									loadProducts("");
								}
							}}
							onChange={(event) => handleSearch(event.target.value)}
							placeholder="Search your catalog"
							className="rounded-md border border-pearl/30 px-3 py-2 text-sm"
							disabled={busy}
						/>
					</div>

					{open && (
						<div className="max-h-80 overflow-y-auto rounded-md border border-pearl/20 bg-white">
							{loading && (
								<div className="p-3 text-sm text-muted-foreground">
									Loading products...
								</div>
							)}
							{!loading && results.length === 0 && (
								<div className="p-3 text-sm text-muted-foreground">
									No products found.
								</div>
							)}
							{results
								.filter(
									(row) =>
										!tags.some((tag) => tag.product.id === row.product_id),
								)
								.map((row) => (
									<button
										key={row.product_id}
										type="button"
										onClick={() => pick(row)}
										disabled={busy}
										className="flex w-full items-center gap-3 border-b border-pearl/10 p-3 text-left hover:bg-gray-50"
									>
										{row.thumbnail_url ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={row.thumbnail_url}
												alt={row.name}
												className="h-10 w-10 rounded object-cover"
											/>
										) : (
											<div className="h-10 w-10 rounded bg-gray-100" />
										)}
										<div className="min-w-0">
											<div className="truncate text-sm font-medium">
												{row.name}
											</div>
											<div className="truncate text-xs text-muted-foreground">
												{subtitleFor(row)}
											</div>
										</div>
									</button>
								))}
						</div>
					)}
				</div>
			)}

			{error && (
				<div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
					<span>{error}</span>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setError(null)}
					>
						Dismiss
					</Button>
				</div>
			)}
		</div>
	);
}
