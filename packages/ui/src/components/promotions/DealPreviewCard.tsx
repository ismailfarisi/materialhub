"use client";

import { Clock, Flame, Package, Store } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";

export interface DealPreviewCardProps {
	product: {
		name: string;
		image_url: string | null;
		vendor_name?: string;
		price: number;
		compare_at_price: number | null;
	} | null;
	variant: {
		sku: string | null;
		options:
			| Record<string, string>
			| Array<{ name?: string; value?: string; label?: string }>
			| null;
		price: number | null;
		compare_at_price: number | null;
	} | null;
	dealPrice: number | null; // fils
	originalPrice: number | null; // fils
	startsAt: Date | null;
	expiresAt: Date | null;
	quantityLimit: number | null;
	currency: string;
	className?: string;
}

function formatPrice(fils: number, currency: string): string {
	const major = (fils / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return `${currency} ${major}`;
}

type VariantOptions = DealPreviewCardProps["variant"] extends infer V
	? V extends { options: infer O }
		? O
		: null
	: null;

function variantOptionLabel(options: VariantOptions): string | null {
	if (!options) return null;
	if (Array.isArray(options)) {
		const parts = options
			.map(
				(o: { name?: string; value?: string; label?: string }) =>
					o?.value ?? o?.label ?? o?.name,
			)
			.filter(Boolean);
		return parts.length ? parts.join(" / ") : null;
	}
	if (typeof options === "object") {
		const parts = Object.entries(options).map(([k, v]) => `${k}: ${v}`);
		return parts.length ? parts.join(" / ") : null;
	}
	return null;
}

function describeWindow(
	startsAt: Date | null,
	expiresAt: Date | null,
): { label: string; tone: "scheduled" | "active" | "expired" } | null {
	if (!startsAt && !expiresAt) return null;
	const now = Date.now();
	const start = startsAt?.getTime() ?? now;
	const end = expiresAt?.getTime() ?? null;

	if (end !== null && now >= end) {
		return { label: "Expired", tone: "expired" };
	}
	if (now < start) {
		return {
			label: `Scheduled · starts ${formatRelative(start - now)}`,
			tone: "scheduled",
		};
	}
	if (end !== null) {
		return {
			label: `Active · ends ${formatRelative(end - now)}`,
			tone: "active",
		};
	}
	return { label: "Active", tone: "active" };
}

function formatRelative(ms: number): string {
	const totalSec = Math.max(0, Math.floor(ms / 1000));
	const days = Math.floor(totalSec / 86400);
	const hours = Math.floor((totalSec % 86400) / 3600);
	const minutes = Math.floor((totalSec % 3600) / 60);
	if (days > 0) return `in ${days}d ${hours}h`;
	if (hours > 0) return `in ${hours}h ${minutes}m`;
	return `in ${minutes}m`;
}

function durationLabel(
	startsAt: Date | null,
	expiresAt: Date | null,
): string | null {
	if (!startsAt || !expiresAt) return null;
	const diffMs = expiresAt.getTime() - startsAt.getTime();
	if (diffMs <= 0) return null;
	const days = Math.floor(diffMs / 86_400_000);
	const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
	if (days > 0) return `Active for ${days}d ${hours}h`;
	return `Active for ${hours}h`;
}

export function DealPreviewCard(props: DealPreviewCardProps) {
	const {
		product,
		variant,
		dealPrice,
		originalPrice,
		startsAt,
		expiresAt,
		quantityLimit,
		currency,
		className,
	} = props;

	if (!product) {
		return (
			<div
				className={cn(
					"rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-6 text-center text-sm text-muted-foreground",
					className,
				)}
			>
				Pick a product to preview the deal.
			</div>
		);
	}

	const variantOpts = variant ? variantOptionLabel(variant.options) : null;
	const pricesDefined =
		dealPrice != null &&
		originalPrice != null &&
		dealPrice > 0 &&
		originalPrice > 0 &&
		dealPrice < originalPrice;
	// Narrowed non-null values for price rendering (only used when pricesDefined)
	const dealPriceSafe = dealPrice ?? 0;
	const originalPriceSafe = originalPrice ?? 0;
	const showPriceBlock = pricesDefined;
	const discountPct = pricesDefined
		? Math.round(
				((originalPriceSafe - dealPriceSafe) / originalPriceSafe) * 100,
			)
		: null;
	const savingsFils = pricesDefined ? originalPriceSafe - dealPriceSafe : null;
	const window = describeWindow(startsAt, expiresAt);
	const duration = durationLabel(startsAt, expiresAt);

	const toneClass = {
		scheduled: "bg-blue-50 text-blue-700 border-blue-200",
		active: "bg-green-50 text-green-700 border-green-200",
		expired: "bg-gray-100 text-gray-600 border-gray-200",
	} as const;

	return (
		<div
			className={cn(
				"rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden",
				className,
			)}
		>
			{/* Hero */}
			<div className="flex gap-3 p-4 border-b bg-gradient-to-br from-muted/40 to-transparent">
				<div className="flex-none w-16 h-16 rounded-lg overflow-hidden bg-muted">
					{product.image_url ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={product.image_url}
							alt={product.name}
							className="w-full h-full object-cover"
						/>
					) : (
						<div className="w-full h-full flex items-center justify-center text-muted-foreground">
							<Package className="h-6 w-6" />
						</div>
					)}
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-semibold leading-tight line-clamp-2">
						{product.name}
					</p>
					{variant && (
						<p className="mt-1 text-xs text-muted-foreground">
							{variant.sku && <span className="font-mono">{variant.sku}</span>}
							{variantOpts && (
								<span>
									{variant.sku ? " · " : ""}
									{variantOpts}
								</span>
							)}
						</p>
					)}
					{product.vendor_name && (
						<span className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
							<Store className="h-3 w-3" />
							{product.vendor_name}
						</span>
					)}
				</div>
			</div>

			{/* Customer-facing price block */}
			{showPriceBlock && (
				<div className="p-4 space-y-1 border-b">
					<div className="flex items-baseline gap-2">
						<span className="text-2xl font-bold text-destructive">
							{formatPrice(dealPriceSafe, currency)}
						</span>
						<span className="text-sm text-muted-foreground line-through">
							{formatPrice(originalPriceSafe, currency)}
						</span>
						<span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-bold px-2 py-1">
							<Flame className="h-3 w-3" />-{discountPct}%
						</span>
					</div>
					<p className="text-xs text-muted-foreground">
						Saves {formatPrice(savingsFils ?? 0, currency)}
					</p>
				</div>
			)}

			{/* Schedule */}
			{window && (
				<div className="px-4 py-3 border-b space-y-1">
					<span
						className={cn(
							"inline-flex items-center gap-1 rounded-full border text-xs font-medium px-2 py-1",
							toneClass[window.tone],
						)}
					>
						<Clock className="h-3 w-3" />
						{window.label}
					</span>
					{duration && (
						<p className="text-[11px] text-muted-foreground">{duration}</p>
					)}
				</div>
			)}

			{/* Cap */}
			{quantityLimit != null && (
				<div className="px-4 py-3 text-xs text-muted-foreground">
					Limited to {quantityLimit.toLocaleString()} units.
				</div>
			)}
		</div>
	);
}
