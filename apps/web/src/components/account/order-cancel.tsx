"use client";

import { Field, FormMessage, Textarea } from "@/components/account/account-ui";
import { apiErrorMessage } from "@/components/account/types";
import { useDialogFocus } from "@/components/cart/use-dialog-focus";
import { Button } from "@/components/swatch";
import { useCancelOrder } from "@/lib/queries/orders";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

/**
 * Mirrors the backend rule for a buyer cancel: the master order transition
 * (order-state-machine.ts MASTER_TRANSITIONS) allows buyer → cancelled only
 * from pending_payment or confirmed, and OrderStatusService.cancelOrder then
 * cancels each supplier sub-order as `system`, which the vendor table only
 * allows from confirmed. Once any supplier has started processing, the
 * backend would reject the cancel, so the action is hidden.
 */
const BUYER_CANCELLABLE = new Set(["pending_payment", "confirmed"]);
const VENDOR_CANCELLABLE = new Set(["confirmed", "cancelled"]);

export function canBuyerCancel(
	orderStatus: string | null | undefined,
	vendorOrders: Array<{ status?: string | null }> = [],
): boolean {
	if (!orderStatus || !BUYER_CANCELLABLE.has(orderStatus)) return false;
	return vendorOrders.every((vo) => !vo.status || VENDOR_CANCELLABLE.has(vo.status));
}

export function OrderCancel({
	orderId,
	orderStatus,
	vendorOrders,
	onCancelled,
}: {
	orderId: string;
	orderStatus?: string | null;
	vendorOrders: Array<{ status?: string | null }>;
	onCancelled?: () => void;
}) {
	const t = useTranslations("account.cancelOrder");
	const cancelOrder = useCancelOrder();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [reasonError, setReasonError] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [done, setDone] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const titleId = useId();
	const bodyId = useId();

	const close = () => {
		if (cancelOrder.isPending) return;
		setOpen(false);
		setSubmitError(null);
		setReasonError(false);
	};
	useDialogFocus(open, panelRef, close);

	if (done) return <FormMessage tone="success">{t("success")}</FormMessage>;
	if (!canBuyerCancel(orderStatus, vendorOrders)) return null;

	function submit() {
		const text = reason.trim();
		if (!text) {
			setReasonError(true);
			return;
		}
		setReasonError(false);
		setSubmitError(null);
		cancelOrder.mutate(
			{ orderId, reason: text },
			{
				onSuccess: () => {
					setOpen(false);
					setReason("");
					setDone(true);
					onCancelled?.();
				},
				onError: (err) => setSubmitError(apiErrorMessage(err, t("failed"))),
			},
		);
	}

	return (
		<>
			<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
				{t("action")}
			</Button>
			{open && (
				<>
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only backdrop; Escape closes via useDialogFocus */}
					<div aria-hidden="true" onClick={close} className="fixed inset-0 z-[60] bg-nl-espresso/50" />
					<div
						ref={panelRef}
						role="alertdialog"
						aria-modal="true"
						aria-labelledby={titleId}
						aria-describedby={bodyId}
						className="fixed inset-x-4 top-1/2 z-[60] mx-auto w-auto max-w-md -translate-y-1/2 rounded-md bg-nl-pearl p-5 text-nl-cacao shadow-lift sm:p-6"
					>
						<h2 id={titleId} className="m-0 font-display text-lg font-semibold">
							{t("title")}
						</h2>
						<p id={bodyId} className="m-0 mt-2 text-sm leading-relaxed text-nl-russet">
							{t("body")}
						</p>
						<form
							className="mt-4 grid gap-3"
							onSubmit={(e) => {
								e.preventDefault();
								submit();
							}}
						>
							<Field label={t("reason")} error={reasonError ? t("reasonRequired") : undefined}>
								{(p) => (
									<Textarea
										{...p}
										data-autofocus
										value={reason}
										maxLength={1000}
										onChange={(e) => setReason(e.target.value)}
									/>
								)}
							</Field>
							{submitError && <FormMessage tone="error">{submitError}</FormMessage>}
							<div className="flex flex-wrap justify-end gap-2">
								<Button type="button" variant="ghost" size="sm" onClick={close} disabled={cancelOrder.isPending}>
									{t("keep")}
								</Button>
								<Button type="submit" size="sm" disabled={cancelOrder.isPending}>
									{cancelOrder.isPending ? t("submitting") : t("confirm")}
								</Button>
							</div>
						</form>
					</div>
				</>
			)}
		</>
	);
}
