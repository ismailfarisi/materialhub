"use client";

import { useChannelEvents } from "@/lib/channels/use-channel-events";
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
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { AddressDrawer } from "./address-drawer";
import { CouponSection } from "./coupon-section";
import { DeliverySection } from "./delivery-section";
import { MAISON_SANS, MAISON_SERIF, MaisonMark, MaisonStepper } from "./maison-primitives";
import { MobileOrderBar } from "./mobile-order-bar";
import { OrderItemsSection } from "./order-items-section";
import { OrderSummarySidebar } from "./order-summary-sidebar";
import { PaymentSection } from "./payment-section";
import { ShippingSection } from "./shipping-section";

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

  const { data: cart } = useCart();
  const { data: addresses } = useAddresses();
  const initiate = useInitiateCheckout();
  const paymentIntent = useCreatePaymentIntent();
  const codCheckout = useCodCheckout();
  const { fire } = useChannelEvents();

  // Fetch quote whenever address changes
  const { data: quoteResult, refetch: refetchQuote } = useCheckoutQuote(selectedAddressId);

  // Sync quote into store whenever query data updates
  useEffect(() => {
    if (quoteResult) setQuote(quoteResult);
  }, [quoteResult, setQuote]);

  // Checkout is full-bleed in a darker surface (linen/pearl) than the app's
  // base body background, so the transparent scrollbar-track gutter reads as a
  // lighter strip on the right. Tint the body to the checkout surface while
  // mounted so the gutter blends; restore on unmount. Scoped here — other
  // pages sit on light cards over the base bg and don't need it.
  useEffect(() => {
    document.body.classList.add("checkout-bleed");
    return () => document.body.classList.remove("checkout-bleed");
  }, []);

  const items = cart?.items || [];
  const cartSubtotal = items.reduce(
    (sum: number, item: any) => sum + item.current_price * item.quantity,
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
          quantity: items.reduce((n: number, i: any) => n + i.quantity, 0),
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

  return (
    <div
      className="-mt-[1px]"
      style={{
        background: "hsl(var(--nl-linen))",
        color: "hsl(var(--nl-cacao))",
        fontFamily: MAISON_SANS,
        minHeight: "calc(100vh - 80px)",
      }}
    >
      {/* Masthead */}
      <header
        className="flex items-center justify-between"
        style={{
          padding: "20px 32px",
          borderBottom: "1px solid rgba(44,24,16,0.08)",
        }}
      >
        <div className="hidden md:flex items-center" style={{ gap: 8 }}>
          <span
            style={{
              fontFamily: MAISON_SERIF,
              fontSize: 20,
              color: "hsl(var(--nl-cacao))",
            }}
          >
            Noor
          </span>
          <span
            style={{
              fontFamily: MAISON_SERIF,
              fontStyle: "italic",
              fontSize: 20,
              color: "hsl(var(--nl-amber-text))",
            }}
          >
            Luna
          </span>
          <MaisonMark size={6} />
        </div>
        <MaisonStepper steps={[t("stepBag"), t("stepAddress"), t("stepPay")]} active={2} />
        <div
          className="flex items-center uppercase"
          style={{
            gap: 8,
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "hsl(var(--nl-russet))",
          }}
        >
          <Lock
            className="h-3.5 w-3.5"
            strokeWidth={1.25}
            style={{ color: "hsl(var(--nl-amber))" }}
          />
          {t("secure")}
        </div>
      </header>

      {/* Amber rule */}
      <div style={{ height: 2, background: "hsl(var(--nl-amber))" }} />

      {/* Body — two-column on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        {/* LEFT — form */}
        <div
          className="lg:border-r"
          style={{
            padding: "32px 24px 48px",
            borderColor: "rgba(44,24,16,0.08)",
          }}
        >
          <div className="mx-auto max-w-2xl lg:mx-0 lg:ms-auto lg:me-12 lg:max-w-[640px]">
            <div
              className="uppercase mb-3"
              style={{
                fontSize: 10,
                letterSpacing: "0.32em",
                color: "hsl(var(--nl-amber-text))",
              }}
            >
              ── {t("title")}
            </div>
            <h1
              style={{
                fontFamily: MAISON_SERIF,
                fontSize: "clamp(2rem, 5vw, 2.75rem)",
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
                fontWeight: 400,
                margin: "0 0 28px",
                color: "hsl(var(--nl-cacao))",
              }}
            >
              {t("pageTitlePre")}{" "}
              <span
                style={{
                  fontStyle: "italic",
                  color: "hsl(var(--nl-amber-text))",
                }}
              >
                {t("pageTitleEmphasis")}
              </span>{" "}
              {t("pageTitlePost")}
            </h1>

            <div className="space-y-2">
              <OrderItemsSection items={items} />
              <DeliverySection />
              <ShippingSection />
              <PaymentSection onExpressCheckoutConfirm={handleExpressCheckoutConfirm} />
              <CouponSection onChanged={handleCouponChanged} />

              {blockingError && (
                <div
                  className="p-3 text-sm"
                  style={{
                    background: "rgba(220, 38, 38, 0.06)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    color: "hsl(var(--destructive))",
                  }}
                >
                  {t(
                    (blockingError.i18n_key ?? "").replace(
                      /^checkout\./,
                      "",
                    ) as unknown as Parameters<typeof t>[0],
                  )}
                </div>
              )}

              {error && (
                <div
                  className="p-3 text-sm"
                  style={{
                    background: "rgba(220, 38, 38, 0.06)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    color: "hsl(var(--destructive))",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — order summary (desktop) */}
        <OrderSummarySidebar
          items={items}
          quote={quoteData}
          canOrder={canOrder}
          onPlaceOrder={handlePlaceOrder}
        />
      </div>

      {/* Mobile sticky bar */}
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
