"use client";

import { StatusPanel } from "@/components/checkout/status-panel";
import { Button } from "@/components/swatch";
import { useOrder } from "@/lib/queries/orders";
import { isValidOrderId } from "@/lib/utils";
import { Clock, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// A Tamara success redirect proves the customer finished Tamara's flow — not
// that we have been told about it. The order is marked paid by the
// `order_approved` webhook, which can land after the customer does. Rather
// than showing them their own order looking unpaid, hold here until the
// webhook arrives, then forward.
const POLL_INTERVAL_MS = 2_000;
const POLL_WINDOW_MS = 30_000;
// Order.payment_status only ever becomes "captured" — verified against
// PaymentStatus (backend/libs/database/src/enums/payment.enums.ts, which has
// no "paid" member at all) and every order-service writer of payment_status
// (order-confirmation.service.ts's markOrderPaid, order-status.service.ts's
// COD-on-delivered path). "authorized" is a real PaymentStatus value but is
// only ever written to the Payment row, never to Order.payment_status, so
// including it here could never actually fire and only widened the window
// for a false "confirmed" read.
const CONFIRMED_STATUSES = ["captured"];

export default function TamaraSuccessPage() {
	const t = useTranslations("checkout");
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();
	const rawOrderId = searchParams.get("order");
	// Defensive against Tamara appending its own query params to the merchant
	// success URL: a malformed `order` value is treated the same as a missing
	// one (give-up state, no polling) rather than polling a doomed request.
	const orderId = isValidOrderId(rawOrderId) ? rawOrderId : "";
	const [gaveUp, setGaveUp] = useState(false);

	const { data: order } = useOrder(orderId, {
		refetchInterval: gaveUp ? false : POLL_INTERVAL_MS,
	});
	const confirmed = CONFIRMED_STATUSES.includes(String(order?.payment_status ?? ""));

	useEffect(() => {
		if (confirmed && orderId) {
			// `replace`, not `push`: Back should return to the storefront, not drop
			// the customer into an interstitial for a payment already confirmed.
			router.replace(`/${locale}/account/orders/${orderId}`);
		}
	}, [confirmed, orderId, locale, router]);

	useEffect(() => {
		if (!orderId) {
			setGaveUp(true);
			return;
		}
		const timer = setTimeout(() => setGaveUp(true), POLL_WINDOW_MS);
		return () => clearTimeout(timer);
	}, [orderId]);

	const waiting = !gaveUp && !confirmed;
	const orderHref = orderId ? `/${locale}/account/orders/${orderId}` : `/${locale}/account/orders`;

	return (
		// biome-ignore lint/a11y/useSemanticElements: live region wraps block content; <output> is phrasing-only
		<div role="status" aria-live="polite">
			{waiting ? (
				<StatusPanel
					tone="pending"
					icon={<Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" strokeWidth={1.75} />}
					title={t("tamaraConfirming")}
					body={t("tamaraConfirmingHint")}
					orderRef={orderId || undefined}
					orderRefLabel={t("orderRef")}
				/>
			) : (
				<StatusPanel
					tone="neutral"
					icon={<Clock className="h-6 w-6" strokeWidth={1.75} />}
					title={t("tamaraSlow")}
					body={t("tamaraSlowHint")}
					orderRef={orderId || undefined}
					orderRefLabel={t("orderRef")}
				>
					<Button asChild variant="primary" size="lg">
						<a href={orderHref}>{orderId ? t("tamaraViewOrder") : t("tamaraViewOrders")}</a>
					</Button>
				</StatusPanel>
			)}
		</div>
	);
}
