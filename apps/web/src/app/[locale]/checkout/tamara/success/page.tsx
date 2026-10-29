"use client";

import { MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import { useOrder } from "@/lib/queries/orders";
import { isValidOrderId } from "@/lib/utils";
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

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div role="status" aria-live="polite" className="flex flex-col items-center">
        {waiting ? (
          <>
            <div
              className="mb-6 h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900"
              aria-hidden="true"
            />
            <h1 style={{ fontFamily: MAISON_SERIF, fontWeight: 400 }} className="text-lg text-neutral-900">
              {t("tamaraConfirming")}
            </h1>
            <p style={{ fontFamily: MAISON_SANS }} className="mt-2 text-sm text-neutral-500">
              {t("tamaraConfirmingHint")}
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: MAISON_SERIF, fontWeight: 400 }} className="text-lg text-neutral-900">
              {t("tamaraSlow")}
            </h1>
            <p style={{ fontFamily: MAISON_SANS }} className="mt-2 text-sm text-neutral-500">
              {t("tamaraSlowHint")}
            </p>
            <a
              style={{ fontFamily: MAISON_SANS }}
              className="mt-6 rounded-full bg-neutral-900 px-6 py-3 text-sm text-white"
              href={orderId ? `/${locale}/account/orders/${orderId}` : `/${locale}/account/orders`}
            >
              {orderId ? t("tamaraViewOrder") : t("tamaraViewOrders")}
            </a>
          </>
        )}
      </div>
    </main>
  );
}
