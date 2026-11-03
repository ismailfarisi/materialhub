"use client";

import { type OrderItemRow, type VendorOrderRow, apiErrorMessage } from "@/components/account/types";
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
	Select,
	Textarea,
} from "@/components/account/account-ui";
import { SPEC_LTR, lineSpecs } from "@/components/account/order-parts";
import { Button, MillLabel } from "@/components/swatch";
import { type CreateReturnPayload, type ReturnReason, useCreateReturn, useOrder } from "@/lib/queries/orders";
import { cn } from "@/lib/utils";
import { PackageX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const REASONS: ReturnReason[] = ["defective", "wrong_item", "not_as_described", "changed_mind", "arrived_late", "other"];

type SelectedItem = {
	vendor_order_id: string;
	order_item_id: string;
	max_quantity: number;
	quantity: number;
	title: string;
};

export default function ReturnPage() {
	const t = useTranslations("account");
	const tReturns = useTranslations("returns");
	const tCommon = useTranslations("common");
	const locale = useLocale();
	const { id } = useParams<{ id: string }>();
	const router = useRouter();
	const { data: order, isLoading, isError, refetch } = useOrder(id);
	const createReturn = useCreateReturn();

	// Buyer can only return delivered items. A Return belongs to a single
	// vendor_order, so we group selection state by vendor_order_id and submit
	// one Return per group. TypeORM serializes the relation as camelCase
	// `vendorOrders`; the snake_case fallback is defensive in case a different
	// serializer is wired in the future.
	const allVendorOrders = order?.vendorOrders || order?.vendor_orders || [];
	const deliveredVendorOrders: VendorOrderRow[] = allVendorOrders.filter((vo: VendorOrderRow) => vo.status === "delivered");

	const [selectedByVendor, setSelectedByVendor] = useState<Record<string, Record<string, SelectedItem>>>({});
	const [reasonByVendor, setReasonByVendor] = useState<Record<string, ReturnReason | "">>({});
	const [detailsByVendor, setDetailsByVendor] = useState<Record<string, string>>({});
	const [missingReason, setMissingReason] = useState<Record<string, boolean>>({});
	const [submitError, setSubmitError] = useState<string | null>(null);

	function toggleItem(vendor_order_id: string, item: OrderItemRow) {
		setSelectedByVendor((prev) => {
			const vendorMap = { ...(prev[vendor_order_id] ?? {}) };
			if (vendorMap[item.id]) {
				delete vendorMap[item.id];
			} else {
				vendorMap[item.id] = {
					vendor_order_id,
					order_item_id: item.id,
					max_quantity: item.quantity ?? 1,
					quantity: 1,
					title: item.product_name ?? item.title ?? "",
				};
			}
			return { ...prev, [vendor_order_id]: vendorMap };
		});
	}

	function setItemQuantity(vendor_order_id: string, order_item_id: string, qty: number) {
		setSelectedByVendor((prev) => {
			const vendorMap = { ...(prev[vendor_order_id] ?? {}) };
			const existing = vendorMap[order_item_id];
			if (!existing) return prev;
			const clamped = Math.max(1, Math.min(qty, existing.max_quantity));
			vendorMap[order_item_id] = { ...existing, quantity: clamped };
			return { ...prev, [vendor_order_id]: vendorMap };
		});
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitError(null);

		const groups = Object.entries(selectedByVendor).filter(([, items]) => Object.keys(items).length > 0);
		if (groups.length === 0) return;

		// Validate every group has a top-level reason picked
		const missing: Record<string, boolean> = {};
		for (const [vendor_order_id] of groups) {
			if (!reasonByVendor[vendor_order_id]) missing[vendor_order_id] = true;
		}
		setMissingReason(missing);
		if (Object.keys(missing).length > 0) {
			setSubmitError(tReturns("errors.reasonRequired"));
			return;
		}

		try {
			for (const [vendor_order_id, items] of groups) {
				const reason = reasonByVendor[vendor_order_id] as ReturnReason;
				const reason_details = detailsByVendor[vendor_order_id]?.trim() || undefined;
				const payload: CreateReturnPayload = {
					orderId: id,
					vendor_order_id,
					reason,
					reason_details,
					items: Object.values(items).map((it) => ({
						order_item_id: it.order_item_id,
						quantity: it.quantity,
						reason,
					})),
				};
				await createReturn.mutateAsync(payload);
			}
			router.push(`/${locale}/account/returns`);
		} catch (err) {
			setSubmitError(apiErrorMessage(err, tReturns("errors.submitFailed")));
		}
	}

	const header = (
		<PageHeader
			title={t("requestReturn")}
			description={
				order?.order_number ? (
					<>
						{tReturns("forOrder")}{" "}
						<Link
							href={`/${locale}/account/orders/${id}`}
							className="font-mono tabular-nums text-nl-cacao underline decoration-nl-cacao/25 hover:decoration-nl-amber"
						>
							<bdi>#{order.order_number}</bdi>
						</Link>
					</>
				) : undefined
			}
		/>
	);

	if (isLoading) {
		return (
			<div>
				{header}
				<ListSkeleton rows={2} />
			</div>
		);
	}

	if (isError) {
		return (
			<div>
				{header}
				<ErrorState onRetry={() => refetch()} />
			</div>
		);
	}

	if (deliveredVendorOrders.length === 0) {
		return (
			<div>
				{header}
				<EmptyState
					icon={PackageX}
					title={tReturns("noReturnableItems")}
					body={tReturns("noReturnableBody")}
					action={{ label: t("backToOrder"), href: `/${locale}/account/orders/${id}` }}
				/>
			</div>
		);
	}

	const nothingSelected = Object.values(selectedByVendor).every((v) => Object.keys(v).length === 0);

	return (
		<div>
			{header}
			<form onSubmit={handleSubmit} className="grid max-w-[760px] gap-4">
				{deliveredVendorOrders.map((vo, i) => {
					const vendorItems = selectedByVendor[vo.id] ?? {};
					const hasSelection = Object.keys(vendorItems).length > 0;
					return (
						<Panel key={vo.id}>
							<PanelHead
								title={
									<>
										{t("supplierShipment", { n: i + 1, total: deliveredVendorOrders.length })}
										{vo.vendor_order_number && (
											<>{" "}<span dir="ltr" className="inline-block font-mono text-[13px] font-normal tabular-nums text-nl-russet">
												{vo.vendor_order_number}
											</span></>
										)}
									</>
								}
							/>
							<fieldset className="m-0 border-0 p-0">
								<legend className="sr-only">{tReturns("chooseItems")}</legend>
								<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0">
									{(vo.items ?? []).map((item) => {
										const selected = vendorItems[item.id];
										const specs = lineSpecs(item);
										return (
											<li key={item.id} className={cn("px-4 py-3 transition-colors md:px-5", selected && "bg-nl-linen/50")}>
												<label className="flex cursor-pointer items-start gap-3">
													<input
														type="checkbox"
														checked={!!selected}
														onChange={() => toggleItem(vo.id, item)}
														className="mt-0.5 h-5 w-5 shrink-0 rounded-sm accent-nl-cacao"
													/>
													<span className="grid min-w-0 flex-1 gap-1.5">
														<span className="break-words text-[14.5px] font-medium text-nl-cacao">
															{item.product_name ?? item.title}
														</span>
														{specs.length > 0 && <MillLabel variant="inline" specs={specs} className={SPEC_LTR} />}
													</span>
													<span className="shrink-0 font-mono text-[13px] tabular-nums text-nl-russet">
														{tReturns("purchasedQty", { qty: item.quantity ?? 1 })}
													</span>
												</label>
												{selected && (item.quantity ?? 1) > 1 && (
													<div className="ms-8 mt-3 flex items-center gap-3">
														<label htmlFor={`qty-${item.id}`} className="text-[13px] font-medium text-nl-cacao">
															{tReturns("quantity")}
														</label>
														<Input
															id={`qty-${item.id}`}
															type="number"
															inputMode="numeric"
															min={1}
															max={selected.max_quantity}
															value={selected.quantity}
															onChange={(e) => setItemQuantity(vo.id, item.id, Number.parseInt(e.target.value, 10) || 1)}
															className="h-11 w-24 font-mono tabular-nums"
														/>
														<span className="text-[13px] text-nl-russet">{tReturns("ofMax", { max: item.quantity ?? 1 })}</span>
													</div>
												)}
											</li>
										);
									})}
								</ul>
							</fieldset>

							{hasSelection && (
								<div className="grid gap-4 border-t border-nl-cacao/10 px-4 py-4 md:px-5">
									<Field label={tReturns("reason")} error={missingReason[vo.id] ? tReturns("errors.reasonMissingOne") : undefined}>
										{(p) => (
											<Select
												{...p}
												value={reasonByVendor[vo.id] ?? ""}
												onChange={(e) => {
													setReasonByVendor((prev) => ({ ...prev, [vo.id]: e.target.value as ReturnReason }));
													setMissingReason((prev) => ({ ...prev, [vo.id]: false }));
												}}
												required
											>
												<option value="">{tReturns("selectReason")}</option>
												{REASONS.map((r) => (
													<option key={r} value={r}>
														{tReturns(`reasons.${r}`)}
													</option>
												))}
											</Select>
										)}
									</Field>
									<Field label={tReturns("additionalDetails")} optional hint={tReturns("detailsHint")}>
										{(p) => (
											<Textarea
												{...p}
												value={detailsByVendor[vo.id] ?? ""}
												onChange={(e) => setDetailsByVendor((prev) => ({ ...prev, [vo.id]: e.target.value }))}
												rows={3}
												maxLength={2000}
											/>
										)}
									</Field>
								</div>
							)}
						</Panel>
					);
				})}

				{submitError && <FieldError>{submitError}</FieldError>}

				<div className="flex flex-wrap items-center gap-3">
					<Button type="submit" variant="signal" size="lg" disabled={nothingSelected || createReturn.isPending}>
						{createReturn.isPending ? tCommon("loading") : tReturns("submitReturn")}
					</Button>
					{nothingSelected && <span className="text-[13px] text-nl-russet">{tReturns("selectToContinue")}</span>}
				</div>
			</form>
		</div>
	);
}
