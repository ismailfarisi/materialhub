"use client";

import { Button } from "@/components/swatch";
import { api } from "@/lib/api";
import { isValidOrderId } from "@/lib/utils";
import { AlertCircle, Loader2, Undo2, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { StatusPanel } from "./status-panel";

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
			const response = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
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

	const failure = variant === "failure";

	return (
		<StatusPanel
			tone={failure ? "error" : "neutral"}
			icon={
				failure ? (
					<XCircle className="h-6 w-6" strokeWidth={1.75} />
				) : (
					<Undo2 className="h-6 w-6" strokeWidth={1.75} />
				)
			}
			title={failure ? t("tamaraFailureTitle") : t("tamaraCancelTitle")}
			body={failure ? t("tamaraFailureBody") : t("tamaraCancelBody")}
			orderRef={orderId || undefined}
			orderRefLabel={t("orderRef")}
			footer={
				orderId ? (
					<a
						className="justify-self-start text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-cacao"
						href={`/${locale}/account/orders/${orderId}`}
					>
						{t("tamaraViewOrder")}
					</a>
				) : null
			}
		>
			{/* biome-ignore lint/a11y/useSemanticElements: live region wraps block content; <output> is phrasing-only */}
			<div role="status" aria-live="polite">
				{error ? (
					<p className="m-0 mb-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/[0.06] px-3.5 py-3 text-[13.5px] text-destructive">
						<AlertCircle className="mt-px h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
						{error}
					</p>
				) : null}
			</div>
			<Button type="button" variant="signal" size="lg" onClick={handleRetry} disabled={retrying} aria-busy={retrying || undefined}>
				{retrying && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
				{t("tamaraRetry")}
			</Button>
			<Button type="button" variant="outline" size="lg" onClick={() => router.push(`/${locale}/checkout`)}>
				{t("tamaraOtherMethod")}
			</Button>
		</StatusPanel>
	);
}
