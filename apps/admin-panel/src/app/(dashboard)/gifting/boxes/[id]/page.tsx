"use client";

import {
	BoxItemPicker,
	type PickerItem,
} from "@/components/gifting/box-item-picker";
import { BoxPriceMeter } from "@/components/gifting/box-price-meter";
import {
	type GiftBoxInput,
	useCreateGiftBox,
	useGiftBox,
	useGiftOccasions,
	useGiftStyles,
	useUpdateGiftBox,
} from "@/lib/queries/gifting";
import { getAdminProductByIdLookup } from "@/lib/queries/lookups";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Input,
	Switch,
	toast,
} from "@materialhub/ui";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function GiftBoxEditorPage() {
	const { id } = useParams<{ id: string }>();
	const isNew = id === "new";
	const router = useRouter();

	const { data: detail, isLoading: loadingBox } = useGiftBox(id);
	const { data: styles = [] } = useGiftStyles();
	const { data: occasions = [] } = useGiftOccasions();
	const create = useCreateGiftBox();
	const update = useUpdateGiftBox();
	const isPending = create.isPending || update.isPending;

	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [description, setDescription] = useState("");
	const [styleId, setStyleId] = useState("");
	const [heroImageUrl, setHeroImageUrl] = useState("");
	const [occasionIds, setOccasionIds] = useState<string[]>([]);
	const [discountPct, setDiscountPct] = useState("0");
	const [isActive, setIsActive] = useState(true);
	const [startsAt, setStartsAt] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [items, setItems] = useState<PickerItem[]>([]);
	const [error, setError] = useState("");

	// Seed form from server detail (edit mode). hydratedItems give unit prices.
	useEffect(() => {
		if (isNew || !detail) return;
		const { box, hydratedItems } = detail;
		setName(box.name);
		setSlug(box.slug);
		setDescription(box.description ?? "");
		setStyleId(box.style_id);
		setHeroImageUrl(box.hero_image_url ?? "");
		setOccasionIds((box.occasions ?? []).map((o) => o.id));
		setDiscountPct(String(box.discount_percentage ?? 0));
		setIsActive(box.is_active);
		setStartsAt(box.starts_at ? box.starts_at.slice(0, 16) : "");
		setExpiresAt(box.expires_at ? box.expires_at.slice(0, 16) : "");
		setItems(
			[...box.items]
				.sort((a, b) => a.sort_order - b.sort_order)
				.map((it) => {
					const hydrated = hydratedItems.find(
						(h) =>
							h.product_id === it.product_id && h.variant_id === it.variant_id,
					);
					return {
						product_id: it.product_id,
						variant_id: it.variant_id,
						quantity: it.quantity,
						unit_price: hydrated?.unit_price ?? null,
						name: it.product_id.slice(0, 8),
						image_url: null,
					};
				}),
		);
	}, [isNew, detail]);

	// Resolve real product names for items seeded from an existing box (which only
	// have the id-prefix fallback). Looks each product up by id, then patches the
	// matching items' `name` in place.
	useEffect(() => {
		if (isNew || !detail) return;
		const ids = Array.from(new Set(detail.box.items.map((it) => it.product_id)));
		if (ids.length === 0) return;
		let cancelled = false;
		(async () => {
			const resolved = await Promise.all(
				ids.map(async (pid) => [pid, await getAdminProductByIdLookup(pid)] as const),
			);
			if (cancelled) return;
			const nameById = new Map(
				resolved
					.filter(([, lk]) => lk != null)
					.map(([pid, lk]) => [pid, lk!.label] as const),
			);
			if (nameById.size === 0) return;
			setItems((prev) =>
				prev.map((it) =>
					nameById.has(it.product_id)
						? { ...it, name: nameById.get(it.product_id)! }
						: it,
				),
			);
		})();
		return () => {
			cancelled = true;
		};
	}, [isNew, detail]);

	const selectedStyle = styles.find((s) => s.id === styleId);

	function toggleOccasion(occId: string) {
		setOccasionIds((prev) =>
			prev.includes(occId) ? prev.filter((x) => x !== occId) : [...prev, occId],
		);
	}

	function buildBody(): GiftBoxInput | null {
		if (!name.trim()) {
			setError("Name is required.");
			return null;
		}
		if (!styleId) {
			setError("A box style is required.");
			return null;
		}
		const pct = Number(discountPct || "0");
		if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
			setError("Discount must be between 0 and 100.");
			return null;
		}
		setError("");
		return {
			name: name.trim(),
			slug: slug.trim() || undefined,
			description: description.trim() || null,
			style_id: styleId,
			hero_image_url: heroImageUrl.trim() || null,
			discount_percentage: pct,
			is_active: isActive,
			starts_at: startsAt ? new Date(startsAt).toISOString() : null,
			expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
			occasion_ids: occasionIds,
			items: items.map((it, i) => ({
				product_id: it.product_id,
				variant_id: it.variant_id ?? undefined,
				quantity: it.quantity,
				sort_order: i,
			})),
		};
	}

	function onSave() {
		const body = buildBody();
		if (!body) return;

		const onError = (err: any) => {
			const code = err?.response?.data?.code;
			const msg =
				code === "GIFT_BOX_OVER_CAPACITY"
					? `Items exceed the style's capacity${
							selectedStyle?.max_capacity
								? ` (max ${selectedStyle.max_capacity})`
								: ""
						}.`
					: (err?.response?.data?.message ?? "Failed to save gift box.");
			setError(msg);
			toast({ title: "Error", description: msg, variant: "destructive" });
		};

		if (isNew) {
			create.mutate(body, {
				onSuccess: (res) => {
					toast({ title: "Gift box created" });
					router.push(`/gifting/boxes/${res.box.id}`);
				},
				onError,
			});
		} else {
			update.mutate(
				{ id, ...body },
				{
					onSuccess: () => toast({ title: "Gift box saved" }),
					onError,
				},
			);
		}
	}

	if (!isNew && loadingBox) {
		return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="sm" asChild className="p-2">
					<Link href="/gifting/boxes">
						<ArrowLeft size={18} />
					</Link>
				</Button>
				<div>
					<h1 className="text-2xl font-bold text-cacao">
						{isNew ? "New Gift Box" : name || "Edit Gift Box"}
					</h1>
					<p className="text-taupe text-sm">
						Pick a style, occasions and products. Price updates on save.
					</p>
				</div>
			</div>

			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{error}
				</div>
			)}

			<div className="grid gap-6 lg:grid-cols-[1fr_360px]">
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="text-sm font-semibold uppercase tracking-wide text-cacao">
								Basics
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="mb-1 block text-sm font-medium text-cacao">
										Name *
									</label>
									<Input
										value={name}
										onChange={(e) => setName(e.target.value)}
										placeholder="Eid Luxe Set"
									/>
								</div>
								<div>
									<label className="mb-1 block text-sm font-medium text-cacao">
										Slug
									</label>
									<Input
										value={slug}
										onChange={(e) => setSlug(e.target.value)}
										placeholder="auto-generated from name"
									/>
								</div>
							</div>

							<div>
								<label className="mb-1 block text-sm font-medium text-cacao">
									Description
								</label>
								<textarea
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									rows={2}
									className="w-full rounded-md border border-gray-300 bg-linen px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
								/>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="mb-1 block text-sm font-medium text-cacao">
										Style *
									</label>
									<select
										value={styleId}
										onChange={(e) => setStyleId(e.target.value)}
										className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm"
									>
										<option value="">Select a style…</option>
										{styles.map((s) => (
											<option key={s.id} value={s.id}>
												{s.name}
												{s.max_capacity != null
													? ` (cap ${s.max_capacity})`
													: ""}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="mb-1 block text-sm font-medium text-cacao">
										Discount (%)
									</label>
									<Input
										type="number"
										min={0}
										max={100}
										value={discountPct}
										onChange={(e) => setDiscountPct(e.target.value)}
										placeholder="0"
									/>
								</div>
							</div>

							<div>
								<label className="mb-1 block text-sm font-medium text-cacao">
									Hero image URL
								</label>
								<Input
									value={heroImageUrl}
									onChange={(e) => setHeroImageUrl(e.target.value)}
									placeholder="https://…/box-hero.jpg"
								/>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="mb-1 block text-sm font-medium text-cacao">
										Starts at
									</label>
									<Input
										type="datetime-local"
										value={startsAt}
										onChange={(e) => setStartsAt(e.target.value)}
									/>
								</div>
								<div>
									<label className="mb-1 block text-sm font-medium text-cacao">
										Expires at
									</label>
									<Input
										type="datetime-local"
										value={expiresAt}
										onChange={(e) => setExpiresAt(e.target.value)}
									/>
								</div>
							</div>

							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-cacao">Active</span>
								<Switch checked={isActive} onCheckedChange={setIsActive} />
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-sm font-semibold uppercase tracking-wide text-cacao">
								Occasions
							</CardTitle>
						</CardHeader>
						<CardContent>
							{occasions.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No occasions defined yet.
								</p>
							) : (
								<div className="flex flex-wrap gap-2">
									{occasions.map((o) => {
										const checked = occasionIds.includes(o.id);
										return (
											<button
												key={o.id}
												type="button"
												onClick={() => toggleOccasion(o.id)}
												className={`rounded-full border px-3 py-1 text-sm transition ${
													checked
														? "border-primary bg-primary/10 text-primary"
														: "border-gray-300 text-taupe hover:bg-muted/60"
												}`}
											>
												{o.name}
											</button>
										);
									})}
								</div>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-sm font-semibold uppercase tracking-wide text-cacao">
								Products
							</CardTitle>
						</CardHeader>
						<CardContent>
							<BoxItemPicker
								items={items}
								onChange={setItems}
								maxCapacity={selectedStyle?.max_capacity ?? null}
							/>
						</CardContent>
					</Card>
				</div>

				<div className="space-y-4">
					<BoxPriceMeter
						items={items}
						discountPercentage={Number(discountPct || "0")}
						packagingFils={selectedStyle?.base_price ?? 0}
						serverPrice={isNew ? null : detail?.price}
					/>
					<Button className="w-full" onClick={onSave} disabled={isPending}>
						{isPending && <Loader2 size={16} className="mr-1.5 animate-spin" />}
						{isNew ? "Create gift box" : "Save changes"}
					</Button>
				</div>
			</div>
		</div>
	);
}
