"use client";

import { Button, MillLabel, type Spec } from "@/components/swatch";
import { useAddToCart } from "@/lib/queries/cart";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { ChevronRight, ImageOff, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { FormMessage, Panel, StatusBadge } from "./account-ui";
import { orderTone, statusLabel } from "./status";
import type { OrderItemRow, OrderRow } from "./types";


/**
 * Line specs from what the order item snapshotted at checkout: the variant
 * name, its option values and the SKU. Nothing is looked up live, so the
 * line reads the same as the day it was bought.
 */
/** Spec values are Latin measurements: keep each chip left-to-right in RTL. */
export const SPEC_LTR = "[&_li]:[direction:ltr] [&_li]:[unicode-bidi:isolate]";

export function lineSpecs(item: Partial<OrderItemRow>): Spec[] {
	const specs: Spec[] = [];
	const attrs = item?.product_snapshot?.attributes;
	if (attrs && typeof attrs === "object") {
		const entries: [string, unknown][] = Array.isArray(attrs)
			? attrs.map((a: { name?: string; option?: string; label?: string; value?: unknown }) => [
					String(a?.name ?? a?.option ?? a?.label ?? ""),
					a?.value,
				])
			: Object.entries(attrs as Record<string, unknown>);
		for (const [label, value] of entries) {
			if (value == null || value === "" || typeof value === "object") continue;
			specs.push({ label: label || String(value), value: String(value) });
		}
	}
	if (specs.length === 0 && item?.variant_name) {
		specs.push({ label: "Variant", value: String(item.variant_name) });
	}
	if (item?.product_sku) specs.push({ label: "SKU", value: String(item.product_sku) });
	return specs;
}

function Thumb({ src, alt, href }: { src?: string | null; alt: string; href?: string | null }) {
	const inner = (
		<>
			{src ? (
				<Image src={src} alt={alt} fill sizes="64px" className="object-cover" />
			) : (
				<ImageOff className="h-4 w-4 text-nl-russet/60" strokeWidth={1.5} aria-hidden="true" />
			)}
		</>
	);
	const cls = "relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-sm bg-nl-linen";
	return href ? (
		<Link href={href} aria-label={alt} tabIndex={-1} className={cls}>
			{inner}
		</Link>
	) : (
		<div className={cls}>{inner}</div>
	);
}

/** One order line: thumbnail, name, mill-label specs, qty × unit, line total. */
export function OrderLine({
	item,
	currency = "AED",
	actions,
	children,
}: {
	item: Partial<OrderItemRow> & { id: string };
	currency?: string;
	actions?: ReactNode;
	children?: ReactNode;
}) {
	const t = useTranslations("account");
	const tCommon = useTranslations("common");
	const locale = useLocale();
	// Null whenever the product was unpublished or removed — the row then stays
	// plain text rather than linking to a 404.
	const href = item.product_slug ? `/${locale}/product/${item.product_slug}` : null;
	const cancelled = item.status === "cancelled";
	const specs = lineSpecs(item);
	const name = item.product_name ?? item.title ?? "";
	// refunded_quantity counts cancelled AND returned units; the order API
	// says how many of them were cancelled (and why).
	const cancelledQty = Math.min(item.cancelled_quantity ?? 0, item.refunded_quantity ?? 0);
	const cancelledAmount = Math.min(item.cancelled_amount ?? 0, item.refunded_amount ?? 0);
	const returnedQty = Math.max(0, (item.refunded_quantity ?? 0) - cancelledQty);
	const returnedAmount = Math.max(0, (item.refunded_amount ?? 0) - cancelledAmount);

	return (
		<li className={cn("grid gap-3 py-4 first:pt-0 last:pb-0", cancelled && "opacity-60")}>
			<div className="flex gap-3 md:gap-4">
				<Thumb src={item.product_image_url} alt={name} href={href} />
				<div className="grid min-w-0 flex-1 content-start gap-1.5">
					{href ? (
						<Link
							href={href}
							className="break-words text-[14.5px] font-medium leading-snug text-nl-cacao underline decoration-transparent underline-offset-2 transition-colors hover:decoration-nl-cacao/40"
						>
							{name}
						</Link>
					) : (
						<p className="m-0 break-words text-[14.5px] font-medium leading-snug text-nl-cacao">{name}</p>
					)}
					{specs.length > 0 && <MillLabel variant="inline" specs={specs} className={SPEC_LTR} />}
					<p className="m-0 font-mono text-[13px] tabular-nums text-nl-russet">
						<span className="sr-only">{tCommon("qty")}: </span>
						<bdi>{item.quantity} × {formatPrice(item.unit_price ?? 0, currency, locale)}</bdi>
					</p>
					{cancelledQty > 0 && (
						<p className="m-0 text-[13px] text-nl-russet">
							{item.cancellation_reason
								? t("cancelledWithReason", { reason: item.cancellation_reason })
								: t("cancelledLine")}
							:{" "}
							<span className="font-mono tabular-nums">
								{cancelledQty} · −{formatPrice(cancelledAmount, currency, locale)}
							</span>
						</p>
					)}
					{returnedQty > 0 && (
						<p className="m-0 text-[13px] text-nl-russet">
							{t("returnedLine")}:{" "}
							<span className="font-mono tabular-nums">
								{returnedQty} · −{formatPrice(returnedAmount, currency, locale)}
							</span>{" "}
							{t("refundedShort")}
						</p>
					)}
				</div>
				<div className="grid shrink-0 content-start justify-items-end gap-2 text-end">
					{item.line_total != null && (
						<span className="font-mono text-[14px] font-medium tabular-nums text-nl-cacao">
							{formatPrice(item.line_total, currency, locale)}
						</span>
					)}
					{actions && <div className="hidden sm:block">{actions}</div>}
				</div>
			</div>
			{actions && <div className="-mt-1 ps-[76px] sm:hidden">{actions}</div>}
			{children}
		</li>
	);
}

/**
 * Buy the same lines again. There is no server-side reorder endpoint, so this
 * adds each still-listed line (same product, variant and quantity) to the
 * cart through the normal cart API, which re-checks price and stock.
 */
export function ReorderButton({ items, className }: { items: OrderItemRow[]; className?: string }) {
	const t = useTranslations("account");
	const locale = useLocale();
	const addToCart = useAddToCart();
	const [state, setState] = useState<{ added: number; skipped: number } | null>(null);
	const [busy, setBusy] = useState(false);

	const eligible = items.filter((i) => i.product_slug && i.product_id && i.status !== "cancelled");
	if (eligible.length === 0) return null;

	async function reorder() {
		setBusy(true);
		setState(null);
		let added = 0;
		for (const item of eligible) {
			try {
				await addToCart.mutateAsync({
					productId: item.product_id as string,
					variantId: item.variant_id ?? null,
					quantity: Math.max(1, (item.quantity ?? 1) - (item.refunded_quantity ?? 0)),
				});
				added += 1;
			} catch {
				// Out of stock or delisted since: counted below, never blocks the rest.
			}
		}
		setState({ added, skipped: items.length - added });
		setBusy(false);
	}

	return (
		<div className={cn("grid justify-items-start gap-2", className)}>
			<Button variant="signal" onClick={reorder} disabled={busy}>
				<RotateCcw className="h-4 w-4 rtl:-scale-x-100" strokeWidth={1.75} aria-hidden="true" />
				{busy ? t("reorderAdding") : t("reorder")}
			</Button>
			{state && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<FormMessage tone={state.added > 0 ? "success" : "error"}>
						{state.added > 0
							? t("reorderAdded", { count: state.added })
							: t("reorderNoneAvailable")}
						{state.added > 0 && state.skipped > 0 && ` ${t("reorderSkipped", { count: state.skipped })}`}
					</FormMessage>
					{state.added > 0 && (
						<Link href={`/${locale}/cart`} className="text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/30 hover:decoration-nl-amber">
							{t("viewCart")}
						</Link>
					)}
				</div>
			)}
		</div>
	);
}

/** Order as a card in the history list. The list payload carries the order,
 * its supplier sub-orders and totals (not the lines), so the card shows what
 * it has and the detail page shows the lines. */
export function OrderCard({ order }: { order: OrderRow }) {
	const t = useTranslations("account");
	const tStatus = useTranslations("account.orderStatus");
	const locale = useLocale();
	const vendorOrders = order.vendorOrders ?? order.vendor_orders ?? [];
	const suppliers = vendorOrders.length;
	const href = `/${locale}/account/orders/${order.id}`;

	return (
		<Panel as="li" className="group relative transition-shadow hover:shadow-lift motion-reduce:transition-none">
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pb-3 pt-4 md:px-5">
				<h3 className="m-0 font-mono text-[14.5px] font-medium tabular-nums text-nl-cacao">
					<Link href={href} className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-nl-amber">
						<span className="sr-only">{t("orderNumber")} </span>
						<bdi>#{order.order_number}</bdi>
					</Link>
				</h3>
				<StatusBadge tone={orderTone(order.status)}>{statusLabel(tStatus, order.status)}</StatusBadge>
			</div>
			<dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-nl-cacao/10 px-4 py-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:px-5">
				<div className="grid gap-1">
					<dt className="mill-label text-nl-russet">{t("placedOn")}</dt>
					<dd className="m-0 font-mono text-[13px] tabular-nums text-nl-cacao">{order.created_at ? formatDate(order.created_at, locale) : "—"}</dd>
				</div>
				<div className="grid gap-1">
					<dt className="mill-label text-nl-russet">{t("suppliersLabel")}</dt>
					<dd className="m-0 text-[13px] text-nl-cacao">
						{suppliers > 0 ? t("supplierCount", { count: suppliers }) : "—"}
					</dd>
				</div>
				<div className="grid gap-1">
					<dt className="mill-label text-nl-russet">{t("payment")}</dt>
					<dd className="m-0 text-[13px] text-nl-cacao">{paymentText(t, order.payment_status)}</dd>
				</div>
				<div className="grid gap-1 sm:justify-items-end">
					<dt className="mill-label text-nl-russet">{t("total")}</dt>
					<dd className="m-0 font-mono text-[14.5px] font-medium tabular-nums text-nl-cacao">
						{formatPrice(order.grand_total ?? 0, order.currency || "AED", locale)}
					</dd>
				</div>
			</dl>
			<div className="flex items-center justify-end gap-1 border-t border-dashed border-nl-cacao/15 px-4 py-2.5 text-[13px] font-medium text-nl-cacao md:px-5">
				{t("viewOrder")}
				<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
			</div>
		</Panel>
	);
}

function paymentText(t: ReturnType<typeof useTranslations>, status?: string) {
	if (!status) return "—";
	return statusLabel((k) => t(`paymentStatus.${k}`), status);
}
