"use client";

import { useRequireAuth } from "@/hooks/use-require-auth";
import { useTranslations } from "next-intl";
import { CheckoutPage as CheckoutPageContent } from "@/components/checkout/checkout-page";

export default function CheckoutPage() {
  const tCommon = useTranslations("common");
  const { isReady } = useRequireAuth();

  if (!isReady) {
    return (
      <div className="container max-w-2xl py-20 text-center text-muted-foreground">
        {tCommon("loading")}
      </div>
    );
  }

  return <CheckoutPageContent />;
}
