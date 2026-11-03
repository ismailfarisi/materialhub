"use client";

import type { VendorOrderRow } from "@/components/account/types";
import {
	EmptyState,
	ErrorState,
	ListSkeleton,
	PageHeader,
	Panel,
	PanelHead,
	Skeleton,
	StatusBadge,
	ValueRow,
} from "@/components/account/account-ui";
import { OrderLine, ReorderButton } from "@/components/account/order-parts";
import { OrderTimeline } from "@/components/account/order-timeline";
import { ReviewForm } from "@/components/account/review-form";
import { orderTone, paymentTone, statusLabel } from "@/components/account/status";
import { Button } from "@/components/swatch";
import { API_URL } from "@/lib/api";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useOrder } from "@/lib/queries/orders";
import { formatPrice } from "@/lib/utils";
import { FileText, PackageSearch, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function OrderDetailPage() {
	const t = useTranslations("account");
	const tCommon = useTranslations("common");
	const tOrderStatus = useTranslations("account.orderStatus");
	const tPayStatus = useTranslations("account.paymentStatus");
	const locale = useLocale();
	const { id } = useParams<{ id: string }>();
	const { data: order, isLoading, isError, refetch } = useOrder(id);
	const [reviewingItem, setReviewingItem] = useState<string | null>(null);
	const { fire } = useChannelEvents();

	// Fire the Purchase event (which the Google channel descriptor turns into a
	// gtag `purchase` + Google Ads `conversion` event) once we know the order is
	// paid. `useChannelEvents` keys the event_id by order.id in sessionStorage,
	// so a page refresh re-fires the SAME id and the server-side Enhanced
	// Conversions Adjustment can dedup against it.
	useEffect(() => {
		if (!order) return;
		// Only fire for paid orders. PaymentStatus values: pending, authorized,
		// captured, failed, refunded, partially_refunded, chargeback, cancelled.
		// We treat "captured" (entity-canonical) and "paid" (forward-compat) as
		// the success terminal; everything else is skipped.
		if (order.payment_status !== "captured" && order.payment_status !== "paid") {
			return;
		}

		// Sum quantities across all vendor sub-orders. The API response from
		// `GET /buyer/orders/:id` nests items under `vendorOrders[].items`, not a
		// top-level `items` array — see backend `OrderService.getById`.
		const vendorOrders = order.vendorOrders || order.vendor_orders || [];
		const quantity = vendorOrders.reduce(
			(n: number, vo: { items?: Array<{ quantity?: number }> }) =>
				n + (vo.items?.reduce((m: number, i: { quantity?: number }) => m + (i.quantity ?? 0), 0) ?? 0),
			0,
		);

		fire("Purchase", {
			order_id: order.id,
			transaction_id: order.id,
			currency: order.currency ?? "AED",
			value_fils: order.grand_total,
			quantity,
			customer_email: order.user?.email ?? undefined,
			customer_phone: order.user?.phone ?? undefined,
		});
	}, [order, fire]);

	if (isLoading) {
		return (
			<div className="grid gap-6">
				<Skeleton className="h-8 w-56" />
				<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
					<ListSkeleton rows={2} />
					<ListSkeleton rows={1} />
				</div>
			</div>
		);
	}

	if (isError) return <ErrorState onRetry={() => refetch()} />;

	if (!order) {
		return (
			<EmptyState
				icon={PackageSearch}
				title={t("orderNotFound")}
				body={t("orderNotFoundBody")}
				action={{ label: t("allOrders"), href: `/${locale}/account/orders` }}
			/>
		);
	}

	const currency = order.currency || "AED";
	const money = (v: number) => formatPrice(v ?? 0, currency, locale);
	const vendorOrders: VendorOrderRow[] = order.vendorOrders || order.vendor_orders || [];
	const allItems = vendorOrders.flatMap((vo) => vo.items ?? []);
	const addr = order.shipping_address || {};
	const addrName = addr.full_name || `${addr.first_name || ""} ${addr.last_name || ""}`.trim();
	const showReceipt =
		order.payment_status === "captured" || order.payment_status === "paid" || order.status !== "pending_payment";

	return (
		<div>
			<PageHeader
				title={
					<>
						{t("orderDetail")} <bdi className="font-mono text-[0.8em] font-medium tabular-nums">#{order.order_number}</bdi>
					</>
				}
				description={
					<span className="inline-flex flex-wrap items-center gap-2">
						{order.created_at && (
							<span className="font-mono tabular-nums">
								{new Date(order.created_at).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE", {
									year: "numeric",
									month: "short",
									day: "numeric",
								})}
							</span>
						)}
						<StatusBadge tone={orderTone(order.status)}>{statusLabel(tOrderStatus, order.status)}</StatusBadge>
					</span>
				}
				action={<ReorderButton items={allItems} />}
			/>

			<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
				{/* Supplier sub-orders */}
				<div className="grid gap-4">
					{vendorOrders.map((vo, i) => (
						<Panel key={vo.id}>
							<PanelHead
								title={
									<>
										{t("supplierShipment", { n: i + 1, total: vendorOrders.length })}
										{vo.vendor_order_number && (
											<>{" "}<span dir="ltr" className="inline-block font-mono text-[13px] font-normal tabular-nums text-nl-russet">
												{vo.vendor_order_number}
											</span></>
										)}
									</>
								}
							/>
							<div className="grid gap-5 px-4 py-4 md:px-5">
								{vo.status && <OrderTimeline currentStatus={vo.status} />}
								<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0">
									{(vo.items || []).map((item) => {
										const canReview = vo.status === "delivered" && !item.is_reviewed;
										return (
											<OrderLine
												key={item.id}
												item={item}
												currency={currency}
												actions={
													canReview && reviewingItem !== item.id ? (
														<Button variant="ghost" size="sm" className="-me-3" onClick={() => setReviewingItem(item.id)}>
															{t("leaveReview")}
														</Button>
													) : null
												}
											>
												{canReview && reviewingItem === item.id && (
													<ReviewForm orderItemId={item.id} onClose={() => setReviewingItem(null)} />
												)}
											</OrderLine>
										);
									})}
								</ul>
							</div>
							{(vo.tracking_number || vo.status === "delivered") && (
								<div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-nl-cacao/15 px-4 py-3 md:px-5">
									{vo.tracking_number ? (
										<p className="m-0 flex min-w-0 items-center gap-2 text-[13px] text-nl-russet">
											<Truck className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
											<span>{t("trackShipment")}:</span>
											<span className="break-all font-mono tabular-nums text-nl-cacao">
												<bdi>
													{vo.carrier ? `${vo.carrier} · ` : ""}
													{vo.tracking_number}
												</bdi>
											</span>
										</p>
									) : (
										<span />
									)}
									{vo.status === "delivered" && (
										<Button asChild variant="outline" size="sm">
											<Link href={`/${locale}/account/orders/${id}/return`}>{t("requestReturn")}</Link>
										</Button>
									)}
								</div>
							)}
						</Panel>
					))}
				</div>

				{/* Summary */}
				<div className="grid gap-4 lg:sticky lg:top-24">
					<Panel>
						<PanelHead title={t("summary")} />
						<div className="px-4 py-3 md:px-5">
							<ValueRow
								label={t("payment")}
								value={<StatusBadge tone={paymentTone(order.payment_status)}>{statusLabel(tPayStatus, order.payment_status)}</StatusBadge>}
							/>
							<ValueRow label={t("subtotal")} value={money(order.subtotal)} />
							{order.discount_total > 0 && <ValueRow label={t("discount")} value={`−${money(order.discount_total)}`} />}
							<ValueRow
								label={t("shipping")}
								value={order.shipping_total > 0 ? money(order.shipping_total) : tCommon("free")}
							/>
							<ValueRow label={t("tax")} value={money(order.tax_total)} />
							{order.refund_total > 0 && <ValueRow label={t("refunded")} value={`−${money(order.refund_total)}`} />}
							<ValueRow
								strong
								className="mt-2 border-t-2 border-nl-cacao pt-3"
								label={t("total")}
								value={money(order.grand_total)}
							/>
						</div>
						{showReceipt && (
							<div className="border-t border-nl-cacao/10 px-4 py-3 md:px-5">
								<a
									href={`${API_URL}/buyer/orders/${order.id}/invoice.pdf`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex min-h-[40px] items-center gap-2 text-sm font-medium text-nl-cacao underline decoration-nl-cacao/25 hover:decoration-nl-amber"
								>
									<FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
									{t("downloadReceipt")}
								</a>
							</div>
						)}
					</Panel>

					<Panel>
						<PanelHead title={t("shippingAddress")} />
						<address className="grid gap-0.5 px-4 py-4 text-sm not-italic text-nl-russet md:px-5">
							{addrName && <span className="font-medium text-nl-cacao">{addrName}</span>}
							{[addr.building_name, addr.apartment, addr.floor].some(Boolean) && (
								<span className="break-words">{[addr.building_name, addr.apartment, addr.floor].filter(Boolean).join(", ")}</span>
							)}
							{(addr.address_line_1 || addr.street) && (
								<span className="break-words">
									{addr.address_line_1 || addr.street}
									{(addr.address_line_2 || addr.area) && `, ${addr.address_line_2 || addr.area}`}
								</span>
							)}
							<span className="break-words">
								{[addr.city, addr.state || addr.emirate, addr.country_code].filter(Boolean).join(", ")}
							</span>
							{addr.phone && (
								<span dir="ltr" className="font-mono tabular-nums rtl:text-end">
									{addr.phone}
								</span>
							)}
						</address>
					</Panel>
				</div>
			</div>
		</div>
	);
}
