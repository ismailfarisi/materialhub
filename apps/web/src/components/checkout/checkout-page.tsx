"use client";

import { useChannelEvents } from "@/lib/channels/use-channel-events";
import type { CartLineItem } from "@/components/cart/cart-lines";
import { BusinessCheckoutBlock, useApprovalGate } from "@/components/business/checkout-business";
import { Button } from "@/components/swatch";
import { isApprovalRequiredError } from "@/lib/business/net-terms";
import { useNetTermsCheckout } from "@/lib/queries/business";
import { useAddresses } from "@/lib/queries/account";
import { useCart } from "@/lib/queries/cart";
import { useCodCheckout, useCreatePaymentIntent, useInitiateCheckout } from "@/lib/queries/checkout";
import { invalidateQuoteEtag, useCheckoutQuote } from "@/lib/queries/checkout-quote";
import { useCheckoutStore } from "@/stores/checkout";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { StripeElementsOptions, StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js";
import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { AddressDrawer } from "./address-drawer";
import { CouponSection } from "./coupon-section";
import { DeliverySection } from "./delivery-section";
import { Notice, StepIndicator } from "./checkout-ui";
import { MobileOrderBar } from "./mobile-order-bar";
import { OrderItemsSection } from "./order-items-section";
import { OrderSummarySidebar } from "./order-summary-sidebar";
import { PaymentSection } from "./payment-section";
import { ShippingSection } from "./shipping-section";
import { STRIPE_FONTS, swatchAppearance } from "./stripe-appearance";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");
const STRIPE_DEFAULT_POSTAL_CODE = "00000";
const STRIPE_ELEMENTS_FALLBACK_AMOUNT = 100;

type CheckoutOrderDetails = {
  orderId: string;
  grandTotal: number;
};

function CheckoutInner() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const {
    selectedAddressId,
    quoteData,
    quoteToken,
    selectedShippingByGroup,
    paymentMethod,
    orderId: existingOrderId,
    error,
    setQuote,
    isQuoteExpired,
    setOrderId,
    setIsPlacing,
    setError,
    reset,
  } = useCheckoutStore();

  const { data: cart, isLoading: cartLoading } = useCart();
  const { data: addresses } = useAddresses();
  const initiate = useInitiateCheckout();
  const paymentIntent = useCreatePaymentIntent();
  const codCheckout = useCodCheckout();
  const netTermsCheckout = useNetTermsCheckout();
  const setApprovalBlocked = useApprovalGate((s) => s.setBlocked);
  const { fire } = useChannelEvents();

  // Fetch quote whenever address changes
  const { data: quoteResult, refetch: refetchQuote } = useCheckoutQuote(selectedAddressId);

  // Sync quote into store whenever query data updates
  useEffect(() => {
    if (quoteResult) setQuote(quoteResult);
  }, [quoteResult, setQuote]);

  const items: CartLineItem[] = cart?.items || [];
  const cartSubtotal = items.reduce(
    (sum: number, item) => sum + item.current_price * item.quantity,
    0,
  );

  const selectedAddress = addresses?.find((a: any) => a.id === selectedAddressId);

  const blockingError = quoteData?.blocking_error;
  const canOrder =
    !!selectedAddressId && !!paymentMethod && items.length > 0 && !!quoteData && !blockingError;

  function showCheckoutReadinessError() {
    if (!selectedAddressId) setError(t("selectAddress"));
    else if (!paymentMethod) setError(t("selectPayment"));
  }

  async function prepareCheckoutOrder(): Promise<CheckoutOrderDetails | null> {
    if (!selectedAddress) {
      showCheckoutReadinessError();
      return null;
    }
      // The quote the rest of this handler reads from. Starts as the
      // store-captured quote; the expiry branch below may swap in a freshly
      // refetched one (the closure's `quoteData`/`quoteToken` don't update
      // until re-render, so we must thread the fresh values through locally).
      let liveQuote = quoteData;
      let liveToken = quoteToken;

      if (isQuoteExpired()) {
        // Force a full refetch: drop the ETag first so the server can't reply
        // 304 with the stale, already-expired body (which would otherwise leave
        // checkout permanently stuck on "quote expired").
        const previousGrandTotal = quoteData?.totals.grand_total_fils ?? null;
        invalidateQuoteEtag(selectedAddressId);
        const { data: freshQuote } = await refetchQuote();

        if (!freshQuote) {
          setError(t("quoteRefreshFailed"));
          return null;
        }
        setQuote(freshQuote);

        // If checkout is now blocked, or the total the customer reviewed has
        // changed, stop and let them re-confirm against the new figures.
        if (
          freshQuote.blocking_error ||
          freshQuote.totals.grand_total_fils !== previousGrandTotal
        ) {
          setError(t("quoteRefreshed"));
          return null;
        }

        // Same total, fresh window — continue placing without bouncing the
        // customer back to the button.
        liveQuote = freshQuote;
        liveToken = freshQuote.quote_token;
      }

      let orderId = existingOrderId || "";
      const grandTotalFils = liveQuote?.totals.grand_total_fils;
      if (grandTotalFils === undefined || grandTotalFils === null) {
        setError(t("paymentFailed"));
        return null;
      }
      // Baseline includes the selected method's surcharge so a retry on an
      // existing order (where we don't re-read order.grandTotal below) still
      // charges the COD/Tabby/Tamara surcharge rather than the card baseline.
      const selectedSurchargeFils =
        liveQuote?.payment_methods.find((m) => m.id === paymentMethod)?.surcharge_fils ?? 0;
      let grandTotal = grandTotalFils + selectedSurchargeFils;

      if (!orderId) {
        // Fire BEFORE the network call so the user-intent moment is captured
        // even if the initiate request fails or stalls. Hook is consent-gated.
        fire("InitiateCheckout", {
          currency: "AED",
          value_fils: cartSubtotal,
          quantity: items.reduce((n, i) => n + i.quantity, 0),
        });

        const order = await initiate.mutateAsync({
          quote_token: liveToken ?? undefined,
          address_id: selectedAddressId ?? undefined,
          shippingAddress: selectedAddress,
          shippingMethod: liveToken
            ? undefined
            : (Object.values(selectedShippingByGroup)[0] ?? "standard"),
          payment_method: paymentMethod ?? undefined,
        });
        orderId = order.orderId;
        // The order's grand total already includes the cart-persisted coupon
        // discount — the server re-validates it during initiate.
        grandTotal = order.grandTotal || grandTotal;
        setOrderId(orderId);
      }

    return { orderId, grandTotal };
  }

  async function handlePlaceOrder() {
    if (!canOrder || !selectedAddress) {
      showCheckoutReadinessError();
      return;
    }

    setIsPlacing(true);
    setError("");

    try {
      const orderDetails = await prepareCheckoutOrder();
      if (!orderDetails) return;

      const { orderId, grandTotal } = orderDetails;

      if (paymentMethod === "card") {
        const intent = await paymentIntent.mutateAsync({
          order_id: orderId,
          amount: grandTotal,
          payment_method: "stripe",
        });

        if (!stripe || !elements) {
          setError(t("stripeNotLoaded"));
          return;
        }

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          setError(t("cardNotEntered"));
          return;
        }

        const { error: stripeError, paymentIntent: confirmedIntent } =
          await stripe.confirmCardPayment(intent.clientSecret, {
            payment_method: {
              card: cardElement,
              billing_details: {
                name: selectedAddress.full_name || "",
                phone: selectedAddress.phone || "",
                address: {
                  postal_code: STRIPE_DEFAULT_POSTAL_CODE,
                },
              },
            },
          });

        if (stripeError) {
          setError(stripeError.message || "Payment failed");
          return;
        }

        if (confirmedIntent?.status === "succeeded") {
          reset();
          router.push(`/${locale}/account/orders/${orderId}`);
        }
      } else if (paymentMethod === "cod") {
        await codCheckout.mutateAsync({ order_id: orderId, amount: grandTotal });
        reset();
        router.push(`/${locale}/account/orders/${orderId}`);
      } else if (paymentMethod === "net_terms") {
        // Pay on invoice: confirms the order on terms (idempotent), then the same success path as COD.
        await netTermsCheckout.mutateAsync({ order_id: orderId });
        reset();
        router.push(`/${locale}/account/orders/${orderId}`);
      } else if (paymentMethod === "tamara") {
        const origin = window.location.origin;
        const { data } = await (await import("@/lib/api")).api.post("/checkout/tamara", {
          order_id: orderId,
          amount: grandTotal,
          // Success lands on an interstitial rather than the order page: the
          // order is only marked paid by the `order_approved` webhook, which
          // can arrive after the customer does.
          return_url: `${origin}/${locale}/checkout/tamara/success?order=${orderId}`,
          failure_url: `${origin}/${locale}/checkout/tamara/failure?order=${orderId}`,
          cancel_url: `${origin}/${locale}/checkout/tamara/cancel?order=${orderId}`,
        });
        if (data.data?.checkoutUrl) window.location.href = data.data.checkoutUrl;
      }
    } catch (err: unknown) {
      const error = err as any;
      if (error.response?.status === 409 && error.response.data?.fresh_quote) {
        setQuote(error.response.data.fresh_quote);
        setError(t("quoteRefreshed"));
        return;
      }
      if (isApprovalRequiredError(error)) {
        // Above the company's approval limit: the business block shows "Send for approval".
        setApprovalBlocked(true);
        return;
      }
      setError(error.response?.data?.message || error.message || t("paymentFailed"));
    } finally {
      setIsPlacing(false);
    }
  }

  async function handleExpressCheckoutConfirm(
    event: StripeExpressCheckoutElementConfirmEvent,
  ) {
    if (!canOrder || !selectedAddress || paymentMethod !== "card") {
      showCheckoutReadinessError();
      event.paymentFailed();
      return;
    }

    if (!stripe || !elements) {
      setError(t("stripeNotLoaded"));
      event.paymentFailed();
      return;
    }

    setIsPlacing(true);
    setError("");

    try {
      const submitResult = await elements.submit();
      if (submitResult.error) {
        setError(submitResult.error.message || t("paymentFailed"));
        event.paymentFailed();
        return;
      }

      const orderDetails = await prepareCheckoutOrder();
      if (!orderDetails) {
        event.paymentFailed();
        return;
      }

      const intent = await paymentIntent.mutateAsync({
        order_id: orderDetails.orderId,
        amount: orderDetails.grandTotal,
        payment_method: "stripe",
      });

      const { error: stripeError, paymentIntent: confirmedIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: selectedAddress.full_name || "",
              phone: selectedAddress.phone || "",
              address: {
                postal_code: STRIPE_DEFAULT_POSTAL_CODE,
              },
            },
          },
          return_url: `${window.location.origin}/${locale}/account/orders/${orderDetails.orderId}`,
        },
        redirect: "if_required",
      });

      if (stripeError) {
        setError(stripeError.message || t("paymentFailed"));
        event.paymentFailed();
        return;
      }

      if (confirmedIntent?.status === "succeeded") {
        reset();
        router.push(`/${locale}/account/orders/${orderDetails.orderId}`);
      }
    } catch (err: unknown) {
      const error = err as any;
      if (error.response?.status === 409 && error.response.data?.fresh_quote) {
        setQuote(error.response.data.fresh_quote);
        setError(t("quoteRefreshed"));
      } else {
        setError(error.response?.data?.message || error.message || t("paymentFailed"));
      }
      event.paymentFailed();
    } finally {
      setIsPlacing(false);
    }
  }

  // The coupon is persisted on the server-side cart; totals change, so drop
  // the cached ETag (or a 304 would replay the pre-coupon quote) and refetch.
  async function handleCouponChanged() {
    invalidateQuoteEtag(selectedAddressId);
    await refetchQuote();
  }

  const stepCurrent =
    selectedAddressId && quoteData && !quoteData.requires_address ? 2 : 1;
  const otherBlockingError =
    blockingError &&
    blockingError.code !== "shipping_unavailable_for_group" &&
    blockingError.code !== "no_eligible_payment_methods"
      ? blockingError
      : null;

  if (!cartLoading && items.length === 0) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-16 md:px-8">
        <div className="mx-auto grid max-w-md justify-items-start gap-3 rounded-md bg-nl-pearl p-6 shadow-card">
          <h1 className="m-0 font-display text-xl font-semibold tracking-[-0.01em] text-nl-cacao">
            {t("emptyTitle")}
          </h1>
          <p className="m-0 text-[14px] text-nl-russet">{t("emptyBody")}</p>
          <Button asChild variant="primary" className="mt-2">
            <Link href={`/${locale}`}>{t("emptyCta")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-36 pt-6 md:px-8 md:pt-8 lg:pb-16">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <h1 className="m-0 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-nl-cacao md:text-[32px]">
          {t("title")}
        </h1>
        <StepIndicator
          steps={[
            { label: t("stepCart"), href: `/${locale}/cart` },
            { label: t("stepDelivery") },
            { label: t("stepPayment") },
          ]}
          current={stepCurrent}
          doneLabel={t("stepDone")}
          currentLabel={t("stepCurrent")}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        <div className="grid gap-4">
          {otherBlockingError && (
            <Notice tone="error" title={t("blockedTitle")}>
              {t(
                (otherBlockingError.i18n_key ?? "").replace(
                  /^checkout\./,
                  "",
                ) as unknown as Parameters<typeof t>[0],
              )}
            </Notice>
          )}
          <OrderItemsSection items={items} quote={quoteData} />
          <DeliverySection />
          <ShippingSection items={items} />
          <BusinessCheckoutBlock />
          <PaymentSection onExpressCheckoutConfirm={handleExpressCheckoutConfirm} />
          <CouponSection onChanged={handleCouponChanged} />
          <p className="m-0 flex items-start gap-2 px-1 text-[12.5px] leading-relaxed text-nl-russet lg:hidden">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {t("secureNote")}
          </p>
        </div>

        <OrderSummarySidebar
          items={items}
          quote={quoteData}
          canOrder={canOrder}
          onPlaceOrder={handlePlaceOrder}
        />
      </div>

      <MobileOrderBar
        items={items}
        quote={quoteData}
        canOrder={canOrder}
        onPlaceOrder={handlePlaceOrder}
      />

      <AddressDrawer />
    </div>
  );
}

export function CheckoutPage() {
  const { quoteData, paymentMethod } = useCheckoutStore();
  const stripeElementsAmount = Math.max(
    STRIPE_ELEMENTS_FALLBACK_AMOUNT,
    (quoteData?.totals.grand_total_fils ?? 0) +
      (quoteData?.payment_methods.find((method) => method.id === paymentMethod)?.surcharge_fils ??
        0),
  );
  const stripeElementsOptions = useMemo<StripeElementsOptions>(
    () => ({
      mode: "payment",
      currency: "aed",
      amount: stripeElementsAmount,
      appearance: swatchAppearance(),
      fonts: STRIPE_FONTS,
    }),
    [stripeElementsAmount],
  );

  return (
    <Elements
      key={`stripe-elements-${stripeElementsAmount}`}
      stripe={stripePromise}
      options={stripeElementsOptions}
    >
      <CheckoutInner />
    </Elements>
  );
}
