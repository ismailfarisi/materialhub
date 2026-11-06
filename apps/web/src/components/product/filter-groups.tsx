"use client";

import { PlasticBanFilter } from "@/components/eco";
import { cn } from "@/lib/utils";
import type { AttributeFilter, FilterValueOption } from "@materialhub/ui";
import { Search, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { FilterCheckRow, FilterGroupShell } from "./filter-group-shell";
import { type FacetConfig, type FilterDraft, isSpecAttribute } from "./filter-state";

interface Props {
	config: FacetConfig;
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
	/** Reserved for parity with prior API — the rail and the sheet share one layout. */
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

const LIST_INITIAL_VISIBLE = 8;

/**
 * The filter groups shared by the desktop rail and the mobile sheet, in the
 * order a trade buyer narrows a listing: specification first (GSM, thickness,
 * size, finish — values in mono), then price, supplier and brand, then the
 * remaining attributes, availability and rating.
 */
export function FilterGroups({ config, draft, setDraft }: Props) {
	const t = useTranslations("browse");
	const withInput = config.attributes.filter((a) => a.filter_input_type);
	const specs = withInput.filter(isSpecAttribute);
	const others = withInput.filter((a) => !isSpecAttribute(a));

	return (
		<div>
			{/* Eco catalogue: plastic-ban ready (approved declarations) */}
			<PlasticBanFilter count={config.plasticBanReady} draft={draft} setDraft={setDraft} />

			{specs.length > 0 && (
				<div className="pb-2">
					<h3 className="mill-label m-0 pt-1 pb-2 text-nl-russet">
						{t("specification")}
					</h3>
					{specs.map((attr) => (
						<AttributeGroup
							key={attr.key}
							attr={attr}
							draft={draft}
							setDraft={setDraft}
							spec
						/>
					))}
				</div>
			)}

			<PriceGroup draft={draft} setDraft={setDraft} />

			{config.vendors.length > 0 && (
				<ListGroup
					title={t("supplier")}
					paramKey="vendor"
					options={config.vendors}
					draft={draft}
					setDraft={setDraft}
					searchPlaceholder={t("findSupplier")}
				/>
			)}

			{config.brands.length > 0 && (
				<ListGroup
					title={t("brand")}
					paramKey="brand"
					options={config.brands}
					draft={draft}
					setDraft={setDraft}
					searchPlaceholder={t("findBrand")}
				/>
			)}

			{others.map((attr) => (
				<AttributeGroup
					key={attr.key}
					attr={attr}
					draft={draft}
					setDraft={setDraft}
				/>
			))}

			<InStockGroup draft={draft} setDraft={setDraft} />

			<RatingGroup draft={draft} setDraft={setDraft} />
		</div>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Native facet groups
// ────────────────────────────────────────────────────────────────────────────

const FIELD =
	"h-10 w-full min-w-0 rounded-md border border-nl-cacao/15 bg-nl-pearl px-3 font-mono text-[13.5px] tabular-nums text-nl-cacao outline-none transition-colors placeholder:text-nl-russet/60 hover:border-nl-cacao/35 focus:border-nl-cacao [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function NumberField({
	label,
	value,
	placeholder,
	onChange,
	onEnter,
	prefix,
}: {
	label: string;
	value: string;
	placeholder?: string;
	onChange: (next: string) => void;
	onEnter?: () => void;
	prefix?: string;
}) {
	const id = useId();
	return (
		<div className="grid min-w-0 flex-1 gap-1.5">
			<label htmlFor={id} className="text-[12.5px] font-medium text-nl-russet">
				{label}
			</label>
			<div className="relative">
				{prefix && (
					<span
						aria-hidden="true"
						className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[12px] text-nl-russet"
					>
						{prefix}
					</span>
				)}
				<input
					id={id}
					type="number"
					inputMode="decimal"
					min={0}
					placeholder={placeholder}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && onEnter) {
							e.preventDefault();
							onEnter();
						}
					}}
					className={cn(FIELD, prefix && "ps-11")}
				/>
			</div>
		</div>
	);
}

function PriceGroup({
	draft,
	setDraft,
}: {
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	const t = useTranslations("browse");
	return (
		<FilterGroupShell title={t("price")}>
			<div className="flex gap-2">
				<NumberField
					label={t("min")}
					prefix="AED"
					value={draft.minPrice ?? ""}
					onChange={(v) => setDraft(setKey(draft, "minPrice", v || null))}
				/>
				<NumberField
					label={t("max")}
					prefix="AED"
					value={draft.maxPrice ?? ""}
					onChange={(v) => setDraft(setKey(draft, "maxPrice", v || null))}
				/>
			</div>
		</FilterGroupShell>
	);
}

function RatingGroup({
	draft,
	setDraft,
}: {
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	const t = useTranslations("browse");
	const current = draft.minRating ?? "";
	return (
		<FilterGroupShell title={t("rating")} defaultOpen={false}>
			{[4, 3, 2].map((r) => {
				const active = current === String(r);
				return (
					<label
						key={r}
						className="-mx-2 flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-2 text-[14px] text-nl-cacao hover:bg-nl-cacao/[0.04]"
					>
						<input
							type="radio"
							name="filter-minRating"
							aria-label={t("ratingAtLeast", { rating: r })}
							checked={active}
							onChange={() =>
								setDraft(setKey(draft, "minRating", active ? null : String(r)))
							}
							onClick={() => active && setDraft(setKey(draft, "minRating", null))}
							className="h-4 w-4 cursor-pointer accent-nl-cacao"
						/>
						<span className="flex items-center gap-0.5" aria-hidden="true">
							{Array.from({ length: 5 }).map((_, i) => (
								<Star
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed 5-star scale
									key={i}
									className={cn(
										"h-3.5 w-3.5",
										i < r ? "fill-nl-cacao text-nl-cacao" : "text-nl-cacao/30",
									)}
									strokeWidth={1.5}
								/>
							))}
						</span>
						<span className="text-[13px] text-nl-russet">
							{t("ratingAtLeast", { rating: r })}
						</span>
					</label>
				);
			})}
		</FilterGroupShell>
	);
}

function InStockGroup({
	draft,
	setDraft,
}: {
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
}) {
	const t = useTranslations("browse");
	// Listings hide sold-out products by default, so this is an opt-IN to see
	// them rather than a filter down to in-stock. Unchecked = the default.
	const checked = draft.includeOutOfStock === "true";
	return (
		<FilterGroupShell title={t("availability")}>
			<FilterCheckRow
				label={t("includeOutOfStock")}
				ariaLabel="includeOutOfStock"
				checked={checked}
				onChange={() =>
					setDraft(setKey(draft, "includeOutOfStock", checked ? null : "true"))
				}
			/>
		</FilterGroupShell>
	);
}

/** Brand and supplier: checkbox list with a find field once the list is long. */
function ListGroup({
	title,
	paramKey,
	options,
	draft,
	setDraft,
	searchPlaceholder,
}: {
	title: string;
	paramKey: "brand" | "vendor";
	options: { value: string; label: string; count?: number }[];
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
	searchPlaceholder: string;
}) {
	const t = useTranslations("browse");
	const [query, setQuery] = useState("");
	const [expanded, setExpanded] = useState(false);

	const filtered = options.filter((o) =>
		o.label.toLowerCase().includes(query.toLowerCase()),
	);
	const overflow = !expanded && filtered.length > LIST_INITIAL_VISIBLE;
	const visible = overflow ? filtered.slice(0, LIST_INITIAL_VISIBLE) : filtered;

	return (
		<FilterGroupShell title={title} count={options.length}>
			{options.length > 6 && (
				<div className="relative mb-1.5">
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-nl-russet"
						strokeWidth={1.75}
					/>
					<input
						type="search"
						aria-label={searchPlaceholder}
						placeholder={searchPlaceholder}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="h-10 w-full rounded-md border border-nl-cacao/15 bg-nl-pearl ps-9 pe-3 text-[13.5px] text-nl-cacao outline-none transition-colors placeholder:text-nl-russet/70 hover:border-nl-cacao/35 focus:border-nl-cacao"
					/>
				</div>
			)}
			<div className="scrollbar-nl -me-1 max-h-[320px] overflow-y-auto pe-1">
				{visible.map((o) => {
					const checked = draft[paramKey]?.split(",").includes(o.value) ?? false;
					return (
						<FilterCheckRow
							key={o.value}
							label={o.label}
							count={o.count}
							checked={checked}
							onChange={() =>
								setDraft(setKey(draft, paramKey, toggleCsv(draft[paramKey], o.value)))
							}
						/>
					);
				})}
				{filtered.length === 0 && (
					<p className="m-0 py-2 text-[13px] text-nl-russet">
						{t("noMatch", { query })}
					</p>
				)}
			</div>
			{overflow && (
				<button
					type="button"
					onClick={() => setExpanded(true)}
					className="mt-1 h-9 rounded-sm text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
				>
					{t("showAll", { count: filtered.length })}
				</button>
			)}
		</FilterGroupShell>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Dynamic attribute groups
// ────────────────────────────────────────────────────────────────────────────

function AttributeGroup({
	attr,
	draft,
	setDraft,
	spec = false,
}: {
	attr: AttributeFilter;
	draft: FilterDraft;
	setDraft: (next: FilterDraft) => void;
	/** Spec groups open by default and set their values in mono. */
	spec?: boolean;
}) {
	const paramValue = draft[attr.key] ?? null;
	const onChange = (next: string | null) =>
		setDraft(setKey(draft, attr.key, next));
	const values = attr.values ?? [];

	if (attr.filter_input_type === "toggle") {
		const on = paramValue === "true";
		return (
			<div className="border-t border-nl-cacao/12 py-3">
				<FilterCheckRow
					label={attr.name}
					checked={on}
					onChange={() => onChange(on ? null : "true")}
				/>
			</div>
		);
	}

	if (attr.filter_input_type === "range") {
		return (
			<FilterGroupShell title={attr.name} defaultOpen={spec}>
				<AttrRange attr={attr} paramValue={paramValue} onChange={onChange} />
			</FilterGroupShell>
		);
	}

	if (attr.filter_input_type === "color_swatch") {
		const selected = new Set(paramValue?.split(",").filter(Boolean) ?? []);
		return (
			<FilterGroupShell title={attr.name} count={values.length} defaultOpen={spec}>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-2 py-1">
					{values.map((v: FilterValueOption) => {
						const isSelected = selected.has(v.value);
						// Vendor-entered colour values: the only place a raw hex is
						// allowed, because it describes the material, not the UI.
						const bg = v.color_hex
							? { backgroundColor: v.color_hex }
							: v.swatch_image_url
								? {
										backgroundImage: `url(${v.swatch_image_url})`,
										backgroundSize: "cover",
									}
								: undefined;
						return (
							<button
								key={v.value}
								type="button"
								aria-label={v.label}
								aria-pressed={isSelected}
								title={v.label}
								onClick={() => {
									const next = new Set(selected);
									if (next.has(v.value)) next.delete(v.value);
									else next.add(v.value);
									const arr = [...next];
									onChange(arr.length ? arr.join(",") : null);
								}}
								className={cn(
									"aspect-square w-full rounded-sm bg-nl-linen ring-1 ring-inset ring-black/10 transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber",
									isSelected
										? "shadow-[0_0_0_2px_hsl(var(--nl-pearl)),0_0_0_4px_hsl(var(--nl-cacao))]"
										: "hover:shadow-[0_0_0_2px_hsl(var(--nl-pearl)),0_0_0_3px_hsl(var(--nl-cacao)/0.35)]",
								)}
								style={bg}
							/>
						);
					})}
				</div>
			</FilterGroupShell>
		);
	}

	if (attr.filter_input_type === "radio") {
		return (
			<FilterGroupShell title={attr.name} count={values.length} defaultOpen={spec}>
				{values.map((v: FilterValueOption) => {
					const checked = paramValue === v.value;
					return (
						<FilterCheckRow
							key={v.value}
							type="radio"
							name={`filter-${attr.key}`}
							label={v.label}
							count={typeof v.count === "number" ? v.count : undefined}
							checked={checked}
							mono={spec}
							onChange={() => onChange(checked ? null : v.value)}
						/>
					);
				})}
			</FilterGroupShell>
		);
	}

	// Default: checkbox
	const selected = new Set(paramValue?.split(",").filter(Boolean) ?? []);
	return (
		<FilterGroupShell title={attr.name} count={values.length} defaultOpen={spec}>
			<div className="scrollbar-nl -me-1 max-h-[320px] overflow-y-auto pe-1">
				{values.map((v: FilterValueOption) => (
					<FilterCheckRow
						key={v.value}
						label={v.label}
						count={typeof v.count === "number" ? v.count : undefined}
						checked={selected.has(v.value)}
						mono={spec}
						onChange={() => {
							const next = new Set(selected);
							if (next.has(v.value)) next.delete(v.value);
							else next.add(v.value);
							const arr = [...next];
							onChange(arr.length ? arr.join(",") : null);
						}}
					/>
				))}
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
	const t = useTranslations("browse");
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

	const [curLo, curHi] = (paramValue ?? "").split("-");
	const dirty = minStr !== (curLo ?? "") || maxStr !== (curHi ?? "");

	return (
		<div className="grid gap-2.5">
			<div className="flex items-end gap-2">
				<NumberField
					label={t("min")}
					placeholder={attr.min?.toString()}
					value={minStr}
					onChange={setMinStr}
					onEnter={apply}
				/>
				<NumberField
					label={t("max")}
					placeholder={attr.max?.toString()}
					value={maxStr}
					onChange={setMaxStr}
					onEnter={apply}
				/>
			</div>
			<button
				type="button"
				onClick={apply}
				disabled={!dirty}
				className="inline-flex h-9 items-center justify-center rounded-md border border-nl-cacao/25 bg-nl-pearl px-3 text-[13px] font-medium text-nl-cacao transition-colors hover:border-nl-cacao/60 disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
			>
				{t("apply")}
			</button>
		</div>
	);
}
