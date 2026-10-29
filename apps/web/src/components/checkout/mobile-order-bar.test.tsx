import type { CheckoutQuote } from "@/lib/queries/checkout-quote";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { MobileOrderBar } from "./mobile-order-bar";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string }) => createElement("img", { alt, ...props }),
}));

vi.mock("@/stores/checkout", () => ({
  useCheckoutStore: () => ({
    isMobileSummaryOpen: false,
    setMobileSummaryOpen: vi.fn(),
    isPlacing: false,
    paymentMethod: "card",
  }),
}));

describe("MobileOrderBar", () => {
  it("constrains the fixed mobile footer to the viewport", () => {
    const quote: CheckoutQuote = {
      schema_version: 1,
      quote_token: "quote",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      currency: "AED",
      requires_address: false,
      fx_snapshot: {
        base: "AED",
        rate: 1,
        captured_at: new Date().toISOString(),
      },
      totals: {
        subtotal_fils: 123_456,
        shipping_fils: 0,
        discount_fils: 0,
        vat_fils: 0,
        vat_rate_bps: 500,
        surcharge_fils: 0,
        grand_total_fils: 123_456,
        default_selection: {
          payment_method_id: "card",
          shipping_by_group: {},
        },
      },
      shipping: null,
      payment_methods: [
        {
          id: "card",
          available: true,
          surcharge_fils: 0,
          surcharge_type: "fixed",
          reason_key: null,
        },
      ],
      compatibility: {},
      notices: [],
    };

    const { container } = render(
      <MobileOrderBar items={[]} quote={quote} canOrder onPlaceOrder={vi.fn()} />,
    );

    const footer = container.querySelector(".fixed.inset-x-0.bottom-0") as HTMLElement;
    const footerInner = footer.firstElementChild as HTMLElement;
    const placeOrderButton = screen.getByRole("button", { name: /placeOrder/ });

    expect(footer.style.maxWidth).toBe("100vw");
    expect(footer.style.boxSizing).toBe("border-box");
    expect(footerInner.style.gridTemplateColumns).toBe("minmax(0, 1fr) auto");
    expect(footerInner.style.width).toBe("100%");
    expect(placeOrderButton.style.maxWidth).toBe("52vw");
    expect(placeOrderButton.style.whiteSpace).toBe("nowrap");
  });
});
