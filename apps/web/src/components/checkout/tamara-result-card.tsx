"use client";

import { MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import { api } from "@/lib/api";
import { isValidOrderId } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// The customer's order still exists and is still pending — Tamara declining or
// being cancelled does not consume it, and the cart is untouched. So both
// recovery routes are live: retry Tamara against the same order, or go back to
// checkout and pick something else.
export function TamaraResultCard({ variant }: { variant: "failure" | "cancel" }) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawOrderId = searchParams.get("order");
  // Defensive against Tamara appending its own query params to the merchant
  // failure/cancel URL: a malformed `order` value is treated the same as a
  // missing one rather than retrying against a doomed order id.
  const orderId = isValidOrderId(rawOrderId) ? rawOrderId : "";
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  async function handleRetry() {
    if (!orderId) {
      router.push(`/${locale}/checkout`);
      return;
    }
    setRetrying(true);
    setError("");
    try {
      const origin = window.location.origin;
      const { data } = await api.post("/checkout/tamara", {
        order_id: orderId,
        return_url: `${origin}/${locale}/checkout/tamara/success?order=${orderId}`,
        failure_url: `${origin}/${locale}/checkout/tamara/failure?order=${orderId}`,
        cancel_url: `${origin}/${locale}/checkout/tamara/cancel?order=${orderId}`,
      });
      const checkoutUrl = data?.data?.checkoutUrl;
      if (!checkoutUrl) throw new Error("missing checkout url");
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      // C2: the order may have been cancelled (e.g. by
      // pending-order-reaper.service.ts) since the customer landed on this
      // page — order-service now rejects that with 409 ORDER_NOT_PAYABLE.
      // Retrying again would just repeat the same 409, so route the customer
      // back to checkout instead of leaving them on a dead-end retry button.
      const response = (err as { response?: { status?: number; data?: { error?: string } } })
        ?.response;
      if (response?.status === 409 && response.data?.error === "ORDER_NOT_PAYABLE") {
        setError(t("tamaraOrderExpired"));
        setRetrying(false);
        router.push(`/${locale}/checkout`);
        return;
      }
      setError(t("tamaraRetryFailed"));
      setRetrying(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 style={{ fontFamily: MAISON_SERIF, fontWeight: 400 }} className="text-xl text-neutral-900">
        {variant === "failure" ? t("tamaraFailureTitle") : t("tamaraCancelTitle")}
      </h1>
      <p style={{ fontFamily: MAISON_SANS }} className="mt-3 text-sm text-neutral-500">
        {variant === "failure" ? t("tamaraFailureBody") : t("tamaraCancelBody")}
      </p>

      <div role="status" aria-live="polite">
        {error ? (
          <p style={{ fontFamily: MAISON_SANS }} className="mt-4 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-8 flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          style={{ fontFamily: MAISON_SANS }}
          className="rounded-full bg-neutral-900 px-6 py-3 text-sm text-white disabled:opacity-60"
        >
          {t("tamaraRetry")}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/${locale}/checkout`)}
          style={{ fontFamily: MAISON_SANS }}
          className="rounded-full border border-neutral-300 px-6 py-3 text-sm text-neutral-900"
        >
          {t("tamaraOtherMethod")}
        </button>
      </div>

      {orderId ? (
        <a
          style={{ fontFamily: MAISON_SANS }}
          className="mt-6 text-xs text-neutral-500 underline"
          href={`/${locale}/account/orders/${orderId}`}
        >
          {t("tamaraViewOrder")}
        </a>
      ) : null}
    </main>
  );
}
