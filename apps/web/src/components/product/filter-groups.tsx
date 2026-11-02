"use client";

import type { AttributeFilter, FilterValueOption } from "@materialhub/ui";
import { Search, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { FilterCheckRow, FilterGroupShell } from "./filter-group-shell";
import type { FacetConfig, FilterDraft } from "./filter-state";

interface Props {
	config: FacetConfig;
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
	/** Reserved for parity with prior API — sidebar always renders the brand shell now. */
	layout?: "vertical" | "accordion";
}

function setKey(
	draft: FilterDraft,
	key: string,
	value: string | null,
): FilterDraft {
	const next = { ...draft };
	if (value == null || value === "") delete next[key];
	else next[key] = value;
	return next;
}

function toggleCsv(current: string | undefined, value: string): string | null {
	const list = current?.split(",").filter(Boolean) ?? [];
	const has = list.includes(value);
	const updated = has ? list.filter((v) => v !== value) : [...list, value];
	return updated.length === 0 ? null : updated.join(",");
}

const BRAND_INITIAL_VISIBLE = 8;

export function FilterGroups({ config, draft, setDraft }: Props) {
	const t = useTranslations("category");

	return (
		<div>
			<PriceGroup draft={draft} setDraft={setDraft} />

			<RatingGroup draft={draft} setDraft={setDraft} />

			<InStockGroup draft={draft} setDraft={setDraft} t={t} />

			{config.brands.length > 0 && (
				<BrandGroup brands={config.brands} draft={draft} setDraft={setDraft} />
			)}

			{config.vendors.length > 0 && (
				<VendorGroup
					vendors={config.vendors}
					draft={draft}
					setDraft={setDraft}
				/>
			)}

			{config.attributes.map((attr) =>
				attr.filter_input_type ? (
					<AttributeGroup
						key={attr.key}
						attr={attr}
						draft={draft}
						setDraft={setDraft}
					/>
				) : null,
			)}
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Native facet groups
// ────────────────────────────────────────────────────────────────────────────

function PriceGroup({
	draft,
	setDraft,
}: {
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	return (
		<FilterGroupShell title="Price (AED)">
			<div className="flex gap-2">
				<PriceBox
					label="Min"
					value={draft.minPrice ?? ""}
					placeholder="Min"
					onChange={(v) => setDraft(setKey(draft, "minPrice", v || null))}
				/>
				<PriceBox
					label="Max"
					value={draft.maxPrice ?? ""}
					placeholder="Max"
					onChange={(v) => setDraft(setKey(draft, "maxPrice", v || null))}
				/>
			</div>
		</FilterGroupShell>
	);
}

function PriceBox({
	label,
	value,
	placeholder,
	onChange,
}: {
	label: string;
	value: string;
	placeholder: string;
	onChange: (next: string) => void;
}) {
	return (
		<div className="flex-1 border border-nl-cacao/20 px-3 py-2">
			<div className="text-[9px] uppercase tracking-[0.22em] text-nl-russet">
				{label}
			</div>
			<input
				type="number"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="w-full bg-transparent font-serif text-[18px] text-nl-cacao outline-none placeholder:text-nl-russet/40"
			/>
		</div>
	);
}

function RatingGroup({
	draft,
	setDraft,
}: {
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	const current = draft.minRating ?? "";
	return (
		<FilterGroupShell title="Rating" defaultOpen={false}>
			<div className="flex flex-col gap-2">
				{[4, 3, 2, 1].map((r) => {
					const active = current === String(r);
					return (
						<label
							key={r}
							className="flex cursor-pointer items-center gap-2 text-[13px] text-nl-cacao"
						>
							<input
								type="radio"
								name="filter-minRating"
								aria-label={`${r}+ stars`}
								checked={active}
								onChange={() =>
									setDraft(
										setKey(draft, "minRating", active ? null : String(r)),
									)
								}
								onClick={() =>
									active && setDraft(setKey(draft, "minRating", null))
								}
								className="h-3.5 w-3.5 cursor-pointer accent-nl-cacao"
							/>
							<span className="flex items-center gap-[3px]">
								{Array.from({ length: 5 }).map((_, i) => (
									<Star
										// biome-ignore lint/suspicious/noArrayIndexKey: fixed 5-star scale
										key={i}
										className="h-3 w-3"
										strokeWidth={1.25}
										fill={i < r ? "currentColor" : "transparent"}
										color="hsl(var(--nl-amber))"
									/>
								))}
							</span>
							<span className="text-[12px]">{r}.0 &amp; up</span>
						</label>
					);
				})}
			</div>
		</FilterGroupShell>
	);
}

function InStockGroup({
	draft,
	setDraft,
	t,
}: {
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
	t: (key: string) => string;
}) {
	// Listings hide sold-out products by default, so this is an opt-IN to see
	// them rather than a filter down to in-stock. Unchecked = the default.
	const checked = draft.includeOutOfStock === "true";
	return (
		<div className="border-t border-nl-cacao/10 py-5">
			<FilterCheckRow
				label={t("includeOutOfStock")}
				ariaLabel="includeOutOfStock"
				checked={checked}
				onChange={() =>
					setDraft(
						setKey(draft, "includeOutOfStock", checked ? null : "true"),
					)
				}
			/>
		</div>
	);
}

function BrandGroup({
	brands,
	draft,
	setDraft,
}: {
	brands: { value: string; label: string; count?: number }[];
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	const [query, setQuery] = useState("");
	const [expanded, setExpanded] = useState(false);

	const filtered = brands.filter((b) =>
		b.label.toLowerCase().includes(query.toLowerCase()),
	);
	const overflow = !expanded && filtered.length > BRAND_INITIAL_VISIBLE;
	const visible = overflow
		? filtered.slice(0, BRAND_INITIAL_VISIBLE)
		: filtered;

	return (
		<FilterGroupShell title="Brand" count={brands.length}>
			{brands.length > 6 && (
				<div className="mb-2.5 flex items-center gap-2 border border-nl-cacao/20 px-2.5 py-2">
					<Search className="h-3.5 w-3.5 text-nl-russet" strokeWidth={1.25} />
					<input
						type="text"
						placeholder="Find a brand"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="w-full bg-transparent text-[12px] text-nl-cacao outline-none placeholder:text-nl-russet/60"
					/>
				</div>
			)}
			<div className="scrollbar-nl flex max-h-[220px] flex-col gap-0.5 overflow-y-auto pe-1">
				{visible.map((b) => {
					const checked = draft.brand?.split(",").includes(b.value) ?? false;
					return (
						<FilterCheckRow
							key={b.value}
							label={b.label}
							count={b.count}
							checked={checked}
							onChange={() =>
								setDraft(
									setKey(draft, "brand", toggleCsv(draft.brand, b.value)),
								)
							}
						/>
					);
				})}
				{filtered.length === 0 && (
					<div className="py-2 text-[12px] text-nl-russet/70">
						No brands match &ldquo;{query}&rdquo;
					</div>
				)}
			</div>
			{overflow && (
				<button
					type="button"
					onClick={() => setExpanded(true)}
					className="mt-2.5 inline-block border-b border-nl-cacao/20 pb-0.5 text-[10px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-cacao"
				>
					See all {filtered.length} →
				</button>
			)}
		</FilterGroupShell>
	);
}

function VendorGroup({
	vendors,
	draft,
	setDraft,
}: {
	vendors: { value: string; label: string }[];
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	return (
		<FilterGroupShell title="Vendor" count={vendors.length} defaultOpen={false}>
			<div className="scrollbar-nl flex max-h-[220px] flex-col gap-0.5 overflow-y-auto pe-1">
				{vendors.map((v) => {
					const checked = draft.vendor?.split(",").includes(v.value) ?? false;
					return (
						<FilterCheckRow
							key={v.value}
							label={v.label}
							checked={checked}
							onChange={() =>
								setDraft(
									setKey(draft, "vendor", toggleCsv(draft.vendor, v.value)),
								)
							}
						/>
					);
				})}
			</div>
		</FilterGroupShell>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Dynamic attribute groups — renders inline so we control brand styling end-to-end
// ────────────────────────────────────────────────────────────────────────────

function AttributeGroup({
	attr,
	draft,
	setDraft,
}: {
	attr: AttributeFilter;
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	const paramValue = draft[attr.key] ?? null;
	const onChange = (next: string | null) =>
		setDraft(setKey(draft, attr.key, next));

	if (attr.filter_input_type === "toggle") {
		const on = paramValue === "true";
		return (
			<div className="border-t border-nl-cacao/10 py-5">
				<button
					type="button"
					aria-pressed={on}
					onClick={() => onChange(on ? null : "true")}
					className={`inline-flex items-center px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] transition-colors ${
						on
							? "border border-nl-cacao bg-nl-cacao text-nl-linen"
							: "border border-nl-cacao/20 bg-transparent text-nl-cacao hover:border-nl-cacao/40"
					}`}
				>
					{attr.name}
				</button>
			</div>
		);
	}

	if (attr.filter_input_type === "range") {
		return (
			<FilterGroupShell title={attr.name} defaultOpen={false}>
				<AttrRange attr={attr} paramValue={paramValue} onChange={onChange} />
			</FilterGroupShell>
		);
	}

	if (attr.filter_input_type === "color_swatch") {
		const selected = new Set(paramValue?.split(",").filter(Boolean) ?? []);
		return (
			<FilterGroupShell title={attr.name}>
				<div className="flex flex-wrap gap-2">
					{(attr.values ?? []).map((v: FilterValueOption) => {
						const isSelected = selected.has(v.value);
						const bg = v.color_hex
							? { backgroundColor: v.color_hex }
							: v.swatch_image_url
								? {
										backgroundImage: `url(${v.swatch_image_url})`,
										backgroundSize: "cover",
									}
								: { backgroundColor: "#e5e7eb" };
						return (
							<button
								key={v.value}
								type="button"
								aria-label={v.label}
								aria-pressed={isSelected}
								onClick={() => {
									const next = new Set(selected);
									if (next.has(v.value)) next.delete(v.value);
									else next.add(v.value);
									const arr = [...next];
									onChange(arr.length ? arr.join(",") : null);
								}}
								className={`h-7 w-7 rounded-full border-2 transition-transform ${
									isSelected
										? "border-nl-cacao scale-110"
										: "border-nl-cacao/15 hover:border-nl-cacao/40"
								}`}
								style={bg}
								title={v.label}
							/>
						);
					})}
				</div>
			</FilterGroupShell>
		);
	}

	if (attr.filter_input_type === "radio") {
		return (
			<FilterGroupShell title={attr.name} defaultOpen={false}>
				<div className="flex flex-col gap-0.5">
					{(attr.values ?? []).map((v: FilterValueOption) => {
						const checked = paramValue === v.value;
						return (
							<label
								key={v.value}
								className="flex cursor-pointer items-center gap-2.5 py-[5px] text-[13px] text-nl-cacao"
							>
								<input
									type="radio"
									name={`filter-${attr.key}`}
									aria-label={v.label}
									checked={checked}
									onChange={() => onChange(checked ? null : v.value)}
									onClick={() => checked && onChange(null)}
									className="h-3.5 w-3.5 cursor-pointer accent-nl-cacao"
								/>
								<span className="flex-1">{v.label}</span>
								{typeof v.count === "number" && (
									<span className="text-[11px] text-nl-russet/70">
										{v.count}
									</span>
								)}
							</label>
						);
					})}
				</div>
			</FilterGroupShell>
		);
	}

	// Default: checkbox
	const selected = new Set(paramValue?.split(",").filter(Boolean) ?? []);
	return (
		<FilterGroupShell title={attr.name} defaultOpen={false}>
			<div className="scrollbar-nl flex max-h-[220px] flex-col gap-0.5 overflow-y-auto pe-1">
				{(attr.values ?? []).map((v: FilterValueOption) => {
					const checked = selected.has(v.value);
					return (
						<FilterCheckRow
							key={v.value}
							label={v.label}
							count={typeof v.count === "number" ? v.count : undefined}
							checked={checked}
							onChange={() => {
								const next = new Set(selected);
								if (next.has(v.value)) next.delete(v.value);
								else next.add(v.value);
								const arr = [...next];
								onChange(arr.length ? arr.join(",") : null);
							}}
						/>
					);
				})}
			</div>
		</FilterGroupShell>
	);
}

function AttrRange({
	attr,
	paramValue,
	onChange,
}: {
	attr: AttributeFilter;
	paramValue: string | null;
	onChange: (next: string | null) => void;
}) {
	const [lo, hi] = (paramValue ?? "").split("-");
	const [minStr, setMinStr] = useState(lo ?? "");
	const [maxStr, setMaxStr] = useState(hi ?? "");

	useEffect(() => {
		const [a, b] = (paramValue ?? "").split("-");
		setMinStr(a ?? "");
		setMaxStr(b ?? "");
	}, [paramValue]);

	function apply() {
		const a = minStr.trim();
		const b = maxStr.trim();
		if (!a && !b) {
			onChange(null);
			return;
		}
		onChange(`${a}-${b}`);
	}

	return (
		<div>
			<div className="flex gap-2">
				<div className="flex-1 border border-nl-cacao/20 px-3 py-2">
					<div className="text-[9px] uppercase tracking-[0.22em] text-nl-russet">
						Min
					</div>
					<input
						type="number"
						aria-label={`${attr.name} min`}
						placeholder={attr.min?.toString() ?? "min"}
						value={minStr}
						onChange={(e) => setMinStr(e.target.value)}
						className="w-full bg-transparent font-serif text-[16px] text-nl-cacao outline-none placeholder:text-nl-russet/40"
					/>
				</div>
				<div className="flex-1 border border-nl-cacao/20 px-3 py-2">
					<div className="text-[9px] uppercase tracking-[0.22em] text-nl-russet">
						Max
					</div>
					<input
						type="number"
						aria-label={`${attr.name} max`}
						placeholder={attr.max?.toString() ?? "max"}
						value={maxStr}
						onChange={(e) => setMaxStr(e.target.value)}
						className="w-full bg-transparent font-serif text-[16px] text-nl-cacao outline-none placeholder:text-nl-russet/40"
					/>
				</div>
			</div>
			<button
				type="button"
				onClick={apply}
				className="mt-2.5 text-[10px] uppercase tracking-[0.22em] text-nl-russet hover:text-nl-cacao"
			>
				Apply
			</button>
		</div>
	);
}
