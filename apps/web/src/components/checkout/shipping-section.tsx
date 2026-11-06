"use client";

import type { CartLineItem } from "@/components/cart/cart-lines";
import { CheckoutDeliveryPromise } from "@/components/delivery/delivery-promise";
import { filsToAed } from "@/lib/money";
import type { QuoteShippingMethod, ShippingGroup } from "@/lib/queries/checkout-quote";
import { useCheckoutStore } from "@/stores/checkout";
import { Clock, Package, Truck, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Money, Notice, OptionTile, Panel, PanelAction } from "./checkout-ui";

const METHOD_ICONS: Record<string, typeof Truck> = {
	standard: Truck,
	express: Zap,
	same_day: Clock,
	pickup: Package,
};

type TFn = ReturnType<typeof useTranslations<"checkout">>;
// Quote-provided keys (method ids, reason keys) are dynamic by nature.
type DynamicKey = Parameters<TFn>[0];

/** Step 2: delivery method per delivery group. */
export function ShippingSection({ items = [] }: { items?: CartLineItem[] }) {
	const t = useTranslations("checkout");
	const {
		quoteData,
		selectedAddressId,
		selectedShippingByGroup,
		expandedShippingGroupId,
		setSelectedShipping,
		setExpandedShippingGroup,
	} = useCheckoutStore();

	const needsAddress = !selectedAddressId || !quoteData || quoteData.requires_address || quoteData.shipping === null;

	if (needsAddress) {
		return (
			<Panel id="checkout-delivery" step={2} title={t("deliveryTitle")}>
				{selectedAddressId && !quoteData ? (
					<div className="grid gap-2 animate-pulse motion-reduce:animate-none" aria-hidden="true">
						<div className="h-14 rounded-md bg-nl-cacao/[0.06]" />
						<div className="h-14 rounded-md bg-nl-cacao/[0.06]" />
					</div>
				) : (
					<p className="m-0 text-[14px] text-nl-russet">{t("deliveryNeedsAddress")}</p>
				)}
			</Panel>
		);
	}

	const { groups } = quoteData.shipping ?? { groups: [] as ShippingGroup[] };
	const showGroupLabels = groups.length > 1;
	const vendorNames = new Map(items.map((i) => [i.vendor_id ?? "", i.vendor_name ?? ""]));

	const freeThresholds = groups
		.flatMap((g) => g.methods)
		.map((m) => m.free_threshold_fils)
		.filter((v): v is number => v !== null);
	const lowestThresholdFils = freeThresholds.length > 0 ? Math.min(...freeThresholds) : null;
	const isShippingFree = quoteData.totals.shipping_fils === 0;
	const remainingFils =
		lowestThresholdFils !== null ? Math.max(0, lowestThresholdFils - quoteData.totals.subtotal_fils) : 0;

	const hint = isShippingFree
		? t("freeShippingQualified")
		: remainingFils > 0
			? t("freeShippingRemaining", { remaining: filsToAed(remainingFils) })
			: null;
	const shippingBlocked = quoteData.blocking_error?.code === "shipping_unavailable_for_group";

	return (
		<Panel id="checkout-delivery" step={2} done={!shippingBlocked} title={t("deliveryTitle")}>
			<div className="grid gap-5">
				{shippingBlocked && quoteData.blocking_error && (
					<Notice tone="error">
						{t(quoteData.blocking_error.i18n_key.replace(/^checkout\./, "") as DynamicKey)}
					</Notice>
				)}
				{groups.map((group) => {
					const selectedMethodId = selectedShippingByGroup[group.group_id] ?? group.selected;
					const isCollapsed = expandedShippingGroupId !== group.group_id;
					const selected = group.methods.find((m) => m.id === selectedMethodId) ?? group.methods[0];
					const suppliers = [
						...new Set(group.items.map((g) => vendorNames.get(g.vendor_id)).filter((n): n is string => !!n)),
					];

					return (
						<div key={group.group_id} className="grid gap-2">
							{(showGroupLabels || suppliers.length > 0) && (
								<p className="m-0 text-[13px] text-nl-russet">
									{showGroupLabels && group.label_key && (
										<span className="font-medium text-nl-cacao">{t(group.label_key as DynamicKey)} · </span>
									)}
									{suppliers.length > 0 && t("shipsFrom", { suppliers: suppliers.join(", ") })}
								</p>
							)}

							{group.methods.length === 0 ? null : isCollapsed && selected ? (
								<div className="flex items-center justify-between gap-3 rounded-md border border-nl-cacao/20 px-3.5 py-3">
									<MethodSummary method={selected} free={isShippingFree} t={t} />
									{group.methods.length > 1 && (
										<PanelAction
											onClick={() => setExpandedShippingGroup(group.group_id)}
											label={t("changeShipping")}
										>
											{t("changeTo")}
										</PanelAction>
									)}
								</div>
							) : (
								<div role="radiogroup" aria-label={t("deliveryTitle")} className="grid gap-2">
									{group.methods.map((method: QuoteShippingMethod) => (
										<OptionTile
											key={method.id}
											name={`shipping-${group.group_id}`}
											value={method.id}
											checked={selectedMethodId === method.id}
											disabled={!method.available}
											onSelect={() => {
												if (!method.available) return;
												setSelectedShipping(group.group_id, method.id);
												setExpandedShippingGroup(null);
											}}
										>
											<MethodSummary
												method={method}
												free={isShippingFree && selectedMethodId === method.id}
												t={t}
											/>
										</OptionTile>
									))}
								</div>
							)}
							{group.items.map((g) => <CheckoutDeliveryPromise key={g.vendor_id} vendorId={g.vendor_id} method={selected?.id} supplierName={vendorNames.size > 1 ? vendorNames.get(g.vendor_id) : null} productIds={items.filter((i) => i.vendor_id === g.vendor_id).map((i) => i.product_id)} className="ps-1" />)}
						</div>
					);
				})}
				{hint && <p className="m-0 text-[13px] text-nl-russet tabular-nums">{hint}</p>}
			</div>
		</Panel>
	);
}

function MethodSummary({ method, free, t }: { method: QuoteShippingMethod; free: boolean; t: TFn }) {
	const tCommon = useTranslations("common");
	const locale = useLocale();
	const Icon = METHOD_ICONS[method.id] ?? Truck;
	const { min, max } = method.estimated_days;
	const eta =
		min === 0 && max === 0 ? (
			tCommon("today")
		) : (
			<>
				<bdi dir="ltr">{min === max ? min : `${min}–${max}`}</bdi> {tCommon("days")}
			</>
		);
	const priceFree = free || method.price_fils === 0;

	return (
		<span className="flex min-w-0 flex-1 items-center gap-3">
			<Icon className="h-5 w-5 shrink-0 text-nl-cacao" strokeWidth={1.75} aria-hidden="true" />
			<span className="grid min-w-0 flex-1">
				<span className="font-medium text-nl-cacao">{t(`shippingMethod_${method.id}` as DynamicKey)}</span>
				{!method.available && method.reason_key ? (
					<span className="text-[13px] text-destructive">{t(method.reason_key as DynamicKey)}</span>
				) : (
					<span className="text-[12.5px] tabular-nums text-nl-russet">{eta}</span>
				)}
			</span>
			<span className="shrink-0 text-[14px] text-nl-cacao">
				{priceFree ? t("free") : <Money fils={method.price_fils} locale={locale} />}
			</span>
		</span>
	);
}
