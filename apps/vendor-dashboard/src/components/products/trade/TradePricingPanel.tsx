"use client";

import {
	type TradePricing,
	useSaveSample,
	useSaveTradeTerms,
	useTradePricing,
} from "@/lib/queries/trade-pricing";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Skeleton,
	Switch,
} from "@materialhub/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	DEFAULT_SAMPLE_MAX,
	type FieldErrors,
	MAX_TIERS,
	PACK_UNITS,
	type TermsForm,
	type TermsView,
	UNITS,
	type Unit,
	aedToFils,
	buildTermsPayload,
	exampleQuantities,
	filsToAed,
	formFromView,
} from "./trade-pricing.helpers";

function apiError(err: unknown): string {
	const e = err as { response?: { data?: { message?: string } } };
	return e?.response?.data?.message ?? "Could not save. Try again.";
}

const select =
	"mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm";

/**
 * Trade pricing tab: unit of measure, minimum order, order increment and the
 * quantity-break tier table for each sellable (each variant, or the product
 * itself when it has no variants), plus the sample toggle.
 */
export function TradePricingPanel({ productId }: { productId: string }) {
	const { data, isLoading, isError } = useTradePricing(productId);

	if (isLoading) return <Skeleton className="h-64 w-full" />;
	if (isError || !data) {
		return (
			<p className="py-4 text-sm text-red-600">Could not load trade pricing.</p>
		);
	}

	const sellables: TermsView[] =
		data.has_variants && data.variants.length > 0
			? data.variants
			: [data.product];

	return (
		<div className="grid gap-4 py-4">
			<p className="max-w-3xl text-sm text-gray-600">
				Buyers order in the unit you set here, from the minimum order up in
				steps of the increment. Tier prices apply per unit once the quantity
				reaches the tier. The base price (
				{data.has_variants ? "each variant's price" : "the product price"})
				applies below the first tier.
			</p>
			{sellables.map((s) => (
				<SellableTerms
					key={s.variant_id ?? "product"}
					productId={productId}
					view={s}
					titled={data.has_variants}
				/>
			))}
			<SampleCard productId={productId} sample={data.sample} />
		</div>
	);
}

function SellableTerms({
	productId,
	view,
	titled,
}: { productId: string; view: TermsView; titled: boolean }) {
	const save = useSaveTradeTerms(productId);
	const [form, setForm] = useState<TermsForm>(() => formFromView(view));
	const [errors, setErrors] = useState<FieldErrors>({});
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		setForm(formFromView(view));
	}, [view]);

	const set = (patch: Partial<TermsForm>) => {
		setSaved(false);
		setForm((f) => ({ ...f, ...patch }));
	};
	const setTier = (i: number, patch: Partial<TermsForm["tiers"][number]>) =>
		set({
			tiers: form.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)),
		});

	const isPack = form.unit !== "" && PACK_UNITS.includes(form.unit);
	const moq = Number.parseInt(form.minOrderQuantity, 10);
	const inc = Number.parseInt(form.orderIncrement, 10);
	const examples =
		Number.isFinite(moq) && Number.isFinite(inc) && moq >= 1 && inc >= 1
			? exampleQuantities(moq, inc)
			: [];
	const unitWord = form.unit || "unit";

	async function onSave() {
		const { payload, errors: errs } = buildTermsPayload(
			view.variant_id,
			form,
			view.price,
		);
		setErrors(errs);
		if (!payload) return;
		try {
			await save.mutateAsync(payload);
			setSaved(true);
		} catch {
			// shown below from save.error
		}
	}

	const id = (k: string) => `trade-${view.variant_id ?? "product"}-${k}`;

	return (
		<Card className="border-gray-200 shadow-sm">
			<CardHeader className="pb-2">
				<CardTitle className="flex flex-wrap items-baseline gap-x-3 text-sm font-medium text-gray-900">
					{titled ? view.name || "Variant" : "Trade terms"}
					<span className="font-mono text-xs font-normal text-gray-500 tabular-nums">
						Base AED {filsToAed(view.price)} / {unitWord}
						{view.sku ? ` · ${view.sku}` : ""}
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<div>
						<Label
							htmlFor={id("unit")}
							className="text-sm font-medium text-gray-700"
						>
							Sold by
						</Label>
						<select
							id={id("unit")}
							value={form.unit}
							onChange={(e) => set({ unit: e.target.value as Unit | "" })}
							className={select}
						>
							<option value="">Not stated</option>
							{UNITS.map((u) => (
								<option key={u} value={u}>
									{u}
								</option>
							))}
						</select>
					</div>
					<div>
						<Label
							htmlFor={id("moq")}
							className="text-sm font-medium text-gray-700"
						>
							Minimum order
						</Label>
						<Input
							id={id("moq")}
							inputMode="numeric"
							value={form.minOrderQuantity}
							onChange={(e) => set({ minOrderQuantity: e.target.value })}
							className="mt-1 font-mono"
							aria-invalid={!!errors.minOrderQuantity}
						/>
						{errors.minOrderQuantity && (
							<p className="mt-1 text-xs text-red-600">
								{errors.minOrderQuantity}
							</p>
						)}
					</div>
					<div>
						<Label
							htmlFor={id("inc")}
							className="text-sm font-medium text-gray-700"
						>
							Order increment
						</Label>
						<Input
							id={id("inc")}
							inputMode="numeric"
							value={form.orderIncrement}
							onChange={(e) => set({ orderIncrement: e.target.value })}
							className="mt-1 font-mono"
							aria-invalid={!!errors.orderIncrement}
						/>
						{errors.orderIncrement && (
							<p className="mt-1 text-xs text-red-600">
								{errors.orderIncrement}
							</p>
						)}
					</div>
					{isPack && (
						<div>
							<Label
								htmlFor={id("ppk")}
								className="text-sm font-medium text-gray-700"
							>
								Each {form.unit} holds
							</Label>
							<div className="mt-1 flex gap-2">
								<Input
									id={id("ppk")}
									inputMode="numeric"
									value={form.unitsPerPack}
									onChange={(e) => set({ unitsPerPack: e.target.value })}
									placeholder="500"
									className="w-24 font-mono"
									aria-invalid={!!errors.unitsPerPack}
								/>
								<select
									aria-label="Contents unit"
									value={form.packContentsUnit}
									onChange={(e) =>
										set({ packContentsUnit: e.target.value as Unit | "" })
									}
									className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
								>
									<option value="">…</option>
									{UNITS.filter((u) => u !== form.unit).map((u) => (
										<option key={u} value={u}>
											{u}
										</option>
									))}
								</select>
							</div>
							{(errors.unitsPerPack || errors.packContentsUnit) && (
								<p className="mt-1 text-xs text-red-600">
									{errors.unitsPerPack ?? errors.packContentsUnit}
								</p>
							)}
						</div>
					)}
				</div>
				{examples.length > 0 && (
					<p className="text-xs text-gray-500">
						Buyers can order{" "}
						<span className="font-mono tabular-nums">
							{examples.join(", ")} …
						</span>{" "}
						{unitWord}
					</p>
				)}

				<div>
					<div className="mb-2 flex items-center justify-between">
						<h4 className="text-sm font-medium text-gray-900">
							Quantity-break prices
						</h4>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={form.tiers.length >= MAX_TIERS}
							onClick={() =>
								set({ tiers: [...form.tiers, { minQuantity: "", price: "" }] })
							}
						>
							<Plus className="mr-1 h-3.5 w-3.5" /> Add tier
						</Button>
					</div>
					{form.tiers.length === 0 ? (
						<p className="text-sm text-gray-500">
							No tiers. Every quantity pays the base price. Add a tier to sell
							for less from a quantity up.
						</p>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="text-xs uppercase tracking-wide text-gray-500">
									<th className="py-1.5 text-left font-medium">
										From quantity
									</th>
									<th className="py-1.5 text-left font-medium">
										Unit price (AED)
									</th>
									<th className="py-1.5 text-right font-medium">Saving</th>
									<th className="w-10" />
								</tr>
							</thead>
							<tbody>
								{form.tiers.map((t, i) => {
									const fils = aedToFils(t.price);
									const pct =
										fils != null && view.price > 0
											? Math.round((1 - fils / view.price) * 100)
											: null;
									const err = errors.tierRows?.[i];
									return (
										// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional while typing
										<tr key={i} className="border-b border-gray-100 align-top">
											<td className="py-1.5 pe-2">
												<Input
													aria-label={`Tier ${i + 1} from quantity`}
													inputMode="numeric"
													value={t.minQuantity}
													onChange={(e) =>
														setTier(i, { minQuantity: e.target.value })
													}
													className="font-mono"
													aria-invalid={!!err}
												/>
												{err && (
													<p className="mt-1 text-xs text-red-600">{err}</p>
												)}
											</td>
											<td className="py-1.5 pe-2">
												<Input
													aria-label={`Tier ${i + 1} unit price in AED`}
													inputMode="decimal"
													value={t.price}
													onChange={(e) =>
														setTier(i, { price: e.target.value })
													}
													placeholder="4.80"
													className="font-mono"
													aria-invalid={!!err}
												/>
											</td>
											<td className="py-3 text-right font-mono tabular-nums text-gray-600">
												{pct != null && pct > 0 ? `−${pct}%` : "—"}
											</td>
											<td className="py-1.5 text-right">
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={`Remove tier ${i + 1}`}
													onClick={() =>
														set({ tiers: form.tiers.filter((_, j) => j !== i) })
													}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
					{errors.tiers && (
						<p className="mt-1 text-xs text-red-600">{errors.tiers}</p>
					)}
				</div>

				<div className="flex items-center gap-3">
					<Button type="button" onClick={onSave} disabled={save.isPending}>
						{save.isPending ? "Saving…" : "Save trade terms"}
					</Button>
					{saved && !save.isPending && (
						<span className="text-sm text-green-700">Saved</span>
					)}
					{save.isError && (
						<span className="text-sm text-red-600">{apiError(save.error)}</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function SampleCard({
	productId,
	sample,
}: { productId: string; sample: TradePricing["sample"] }) {
	const save = useSaveSample(productId);
	const [enabled, setEnabled] = useState(sample?.enabled ?? false);
	const [price, setPrice] = useState(sample ? filsToAed(sample.price) : "");
	const [maxQty, setMaxQty] = useState(
		sample?.max_quantity != null ? String(sample.max_quantity) : "",
	);
	const [stock, setStock] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		setEnabled(sample?.enabled ?? false);
		setPrice(sample ? filsToAed(sample.price) : "");
		setMaxQty(sample?.max_quantity != null ? String(sample.max_quantity) : "");
	}, [sample]);

	async function onSave(nextEnabled = enabled) {
		setError(null);
		setSaved(false);
		if (!nextEnabled) {
			try {
				await save.mutateAsync({ enabled: false });
				setSaved(true);
			} catch (e) {
				setError(apiError(e));
			}
			return;
		}
		const fils = aedToFils(price || "0");
		if (fils == null)
			return setError("Price must look like 5.00 (0 for a free sample)");
		const cap = maxQty.trim() === "" ? null : Number.parseInt(maxQty, 10);
		if (cap != null && (!Number.isInteger(cap) || cap < 1 || cap > 20))
			return setError("Samples per order: 1 to 20");
		const qty = stock.trim() === "" ? 0 : Number.parseInt(stock, 10);
		if (!Number.isInteger(qty) || qty < 0)
			return setError("Stock to add must be a whole number");
		try {
			await save.mutateAsync({
				enabled: true,
				price: fils,
				max_quantity: cap,
				quantity_on_hand: qty || undefined,
			});
			setStock("");
			setSaved(true);
		} catch (e) {
			setError(apiError(e));
		}
	}

	return (
		<Card className="border-gray-200 shadow-sm">
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center justify-between gap-3 text-sm font-medium text-gray-900">
					<span>Sample</span>
					<span className="flex items-center gap-2 text-sm font-normal text-gray-600">
						<Label htmlFor={`sample-${productId}`}>Offer a sample</Label>
						<Switch
							id={`sample-${productId}`}
							checked={enabled}
							onCheckedChange={(v: boolean) => {
								setEnabled(v);
								if (!v && sample?.enabled) void onSave(false);
							}}
						/>
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3">
				<p className="text-sm text-gray-600">
					A sample lets buyers try the material before a run. It is ordered one
					at a time up to the limit, ships at the marketplace sample shipping
					rate, and has its own stock.
				</p>
				{enabled && (
					<>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<div>
								<Label
									htmlFor={`sample-price-${productId}`}
									className="text-sm font-medium text-gray-700"
								>
									Sample price (AED)
								</Label>
								<Input
									id={`sample-price-${productId}`}
									inputMode="decimal"
									value={price}
									onChange={(e) => setPrice(e.target.value)}
									placeholder="0.00"
									className="mt-1 font-mono"
								/>
							</div>
							<div>
								<Label
									htmlFor={`sample-max-${productId}`}
									className="text-sm font-medium text-gray-700"
								>
									Samples per order
								</Label>
								<Input
									id={`sample-max-${productId}`}
									inputMode="numeric"
									value={maxQty}
									onChange={(e) => setMaxQty(e.target.value)}
									placeholder={String(DEFAULT_SAMPLE_MAX)}
									className="mt-1 font-mono"
								/>
							</div>
							<div>
								<Label
									htmlFor={`sample-stock-${productId}`}
									className="text-sm font-medium text-gray-700"
								>
									Add sample stock
								</Label>
								<Input
									id={`sample-stock-${productId}`}
									inputMode="numeric"
									value={stock}
									onChange={(e) => setStock(e.target.value)}
									placeholder="0"
									className="mt-1 font-mono"
								/>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<Button
								type="button"
								onClick={() => onSave(true)}
								disabled={save.isPending}
							>
								{save.isPending
									? "Saving…"
									: sample?.enabled
										? "Save sample"
										: "Turn on sample"}
							</Button>
							{sample?.sku && (
								<span className="font-mono text-xs text-gray-500">
									{sample.sku}
								</span>
							)}
						</div>
					</>
				)}
				{saved && !save.isPending && (
					<p className="text-sm text-green-700">Saved</p>
				)}
				{error && <p className="text-sm text-red-600">{error}</p>}
			</CardContent>
		</Card>
	);
}
