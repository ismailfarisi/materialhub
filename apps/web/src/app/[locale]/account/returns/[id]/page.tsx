"use client";

import { type OrderItemRow, type ReturnItemRow, apiErrorMessage } from "@/components/account/types";
import {
	EmptyState,
	ErrorState,
	Field,
	FieldError,
	Input,
	ListSkeleton,
	PageHeader,
	Panel,
	PanelHead,
	Skeleton,
	StatusBadge,
	ValueRow,
} from "@/components/account/account-ui";
import { OrderLine } from "@/components/account/order-parts";
import { ReturnTimeline } from "@/components/account/return-timeline";
import { returnTone, statusLabel } from "@/components/account/status";
import { Button } from "@/components/swatch";
import { useReturn, useUpdateReturnShipping } from "@/lib/queries/orders";
import { formatPrice } from "@/lib/utils";
import { PackageSearch, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";

function formatDateTime(iso: string, locale: string) {
	return new Date(iso).toLocaleString(locale === "ar" ? "ar-AE" : "en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export default function ReturnDetailPage() {
	const t = useTranslations("returns");
	const tCommon = useTranslations("common");
	const locale = useLocale();
	const { id } = useParams<{ id: string }>();
	const { data: ret, isLoading, isError, refetch } = useReturn(id);
	const updateShipping = useUpdateReturnShipping();

	const [carrier, setCarrier] = useState("");
	const [tracking, setTracking] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);

	if (isLoading) {
		return (
			<div className="grid gap-6">
				<Skeleton className="h-8 w-48" />
				<ListSkeleton rows={2} />
			</div>
		);
	}
	if (isError) return <ErrorState onRetry={() => refetch()} />;
	if (!ret) {
		return (
			<EmptyState
				icon={PackageSearch}
				title={t("notFound")}
				action={{ label: t("title"), href: `/${locale}/account/returns` }}
			/>
		);
	}

	async function handleShipping(e: React.FormEvent) {
		e.preventDefault();
		setSubmitError(null);
		if (!carrier.trim() || !tracking.trim()) return;
		try {
			await updateShipping.mutateAsync({
				id,
				carrier: carrier.trim(),
				tracking_number: tracking.trim(),
			});
			setCarrier("");
			setTracking("");
		} catch (err) {
			setSubmitError(apiErrorMessage(err, t("errors.submitFailed")));
		}
	}

	const items: ReturnItemRow[] = ret.returnItems ?? ret.return_items ?? ret.items ?? [];
	const money = (v: number | null | undefined) => (v == null ? "—" : formatPrice(v, "AED", locale));
	const tStatus = (k: string) => t(`statuses.${k}`);
	const shippedBack =
		(ret.status === "shipped_back" || ret.status === "received" || ret.status === "refunded") && ret.return_tracking_number;

	return (
		<div>
			<PageHeader
				title={<span className="font-mono font-medium tabular-nums">{ret.return_number ?? ret.id.slice(0, 8)}</span>}
				description={
					<span className="inline-flex flex-wrap items-center gap-2">
						{ret.created_at && <span className="font-mono tabular-nums">{formatDateTime(ret.created_at, locale)}</span>}
						<StatusBadge tone={returnTone(ret.status)}>{statusLabel(tStatus, ret.status)}</StatusBadge>
					</span>
				}
			/>

			<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
				<div className="grid gap-4">
					<Panel>
						<PanelHead title={t("progress")} />
						<div className="grid gap-3 px-4 py-4 md:px-5">
							<ReturnTimeline currentStatus={ret.status} />
							{ret.rejection_reason && (
								<div className="grid gap-1 rounded-md bg-destructive/[0.05] p-3">
									<span className="mill-label text-destructive">{t("rejectionReason")}</span>
									<p className="m-0 text-sm text-nl-cacao">{ret.rejection_reason}</p>
								</div>
							)}
						</div>
					</Panel>

					{ret.status === "approved" && (
						<Panel>
						<form onSubmit={handleShipping} className="grid gap-4 p-4 md:p-5">
							<div className="grid gap-1">
								<h2 className="m-0 font-display text-[15.5px] font-semibold text-nl-cacao">{t("shippingTitle")}</h2>
								<p className="m-0 text-sm text-nl-russet">{t("shippingHint")}</p>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<Field label={t("carrier")}>
									{(p) => (
										<Input {...p} value={carrier} onChange={(e) => setCarrier(e.target.value)} required maxLength={100} autoComplete="off" />
									)}
								</Field>
								<Field label={t("trackingNumber")}>
									{(p) => (
										<Input
											{...p}
											value={tracking}
											onChange={(e) => setTracking(e.target.value)}
											required
											maxLength={100}
											autoComplete="off"
											className="font-mono"
										/>
									)}
								</Field>
							</div>
							{submitError && <FieldError>{submitError}</FieldError>}
							<div>
								<Button
									type="submit"
									variant="signal"
									disabled={updateShipping.isPending || !carrier.trim() || !tracking.trim()}
								>
									{updateShipping.isPending ? tCommon("loading") : t("submitShipping")}
								</Button>
							</div>
						</form>
						</Panel>
					)}

					{items.length > 0 && (
						<Panel>
							<PanelHead title={t("items")} />
							<ul className="m-0 list-none divide-y divide-nl-cacao/10 px-4 py-4 md:px-5">
								{items.map((it) => {
									const product: Partial<OrderItemRow> = it.orderItem ?? it.order_item ?? {};
									const unit = product.unit_price;
									const line =
										it.refund_amount ?? product.line_total ?? (unit != null && it.quantity != null ? unit * it.quantity : null);
									return (
										<OrderLine
											key={it.id}
											item={{
												...product,
												id: it.id,
												product_name: product.product_name ?? product.name ?? it.product_name ?? t("items"),
												quantity: it.quantity,
												line_total: line,
												refunded_quantity: 0,
											}}
										/>
									);
								})}
							</ul>
						</Panel>
					)}
				</div>

				<div className="grid gap-4 lg:sticky lg:top-24">
					<Panel>
						<PanelHead title={t("refund")} />
						<div className="px-4 py-3 md:px-5">
							<ValueRow label={t("refundAmount")} value={money(ret.refund_amount)} strong />
							{ret.refunded_at && <ValueRow label={t("refundedAt")} value={formatDateTime(ret.refunded_at, locale)} />}
						</div>
					</Panel>
					{shippedBack && (
						<Panel>
							<PanelHead title={t("shippingRecorded")} />
							<p className="m-0 flex items-center gap-2 px-4 py-4 text-sm md:px-5">
								<Truck className="h-4 w-4 shrink-0 text-nl-russet" strokeWidth={1.75} aria-hidden="true" />
								<span className="break-all font-mono tabular-nums text-nl-cacao">
									{ret.return_shipping_carrier} · {ret.return_tracking_number}
								</span>
							</p>
						</Panel>
					)}
				</div>
			</div>
		</div>
	);
}
