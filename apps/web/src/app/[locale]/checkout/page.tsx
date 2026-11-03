"use client";

import { CheckoutPage as CheckoutPageContent } from "@/components/checkout/checkout-page";
import { CheckoutSkeleton } from "@/components/checkout/checkout-skeleton";
import { useRequireAuth } from "@/hooks/use-require-auth";

export default function CheckoutPage() {
	const { isReady } = useRequireAuth();

	if (!isReady) return <CheckoutSkeleton />;

	return <CheckoutPageContent />;
}
