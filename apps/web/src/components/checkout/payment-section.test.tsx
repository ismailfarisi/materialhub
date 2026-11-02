import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentSection } from "./payment-section";

const checkoutStore = vi.hoisted(() => ({
  paymentMethod: "card",
  setPaymentMethod: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@stripe/react-stripe-js", () => ({
  CardElement: () => <div data-testid="stripe-card-element" />,
  ExpressCheckoutElement: ({
    options,
  }: {
    options?: { buttonHeight?: number };
    onConfirm?: () => void;
  }) => (
    <div
      data-button-height={String(options?.buttonHeight ?? "")}
      data-testid="stripe-express-checkout"
    />
  ),
}));

vi.mock("@/lib/queries/checkout-quote", () => ({
  usePaymentInstruments: () => ({ data: { instruments: [] } }),
}));

vi.mock("@/stores/checkout", () => ({
  useCheckoutStore: () => ({
    quoteData: {
      totals: { grand_total_fils: 12000 },
      payment_methods: [
        {
          id: "card",
          available: true,
          surcharge_fils: 0,
          surcharge_type: "fixed",
          reason_key: null,
        },
        {
          id: "cod",
          available: true,
          surcharge_fils: 0,
          surcharge_type: "fixed",
          reason_key: null,
        },
      ],
    },
    paymentMethod: checkoutStore.paymentMethod,
    setPaymentMethod: checkoutStore.setPaymentMethod,
  }),
}));

describe("PaymentSection", () => {
  beforeEach(() => {
    checkoutStore.paymentMethod = "card";
    checkoutStore.setPaymentMethod.mockClear();
  });

  it("renders Stripe Express Checkout for card payments", () => {
    render(<PaymentSection onExpressCheckoutConfirm={vi.fn()} />);

    expect(screen.getByTestId("stripe-express-checkout")).toHaveAttribute(
      "data-button-height",
      "44",
    );
    expect(screen.getByTestId("stripe-card-element")).toBeInTheDocument();
  });

  it("hides Stripe Express Checkout for non-card payments", () => {
    checkoutStore.paymentMethod = "cod";

    render(<PaymentSection onExpressCheckoutConfirm={vi.fn()} />);

    expect(screen.queryByTestId("stripe-express-checkout")).not.toBeInTheDocument();
  });

  it("offers each method as a radio and selects on click", () => {
    render(<PaymentSection onExpressCheckoutConfirm={vi.fn()} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /methodCard/ })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: /methodCod/ }));
    expect(checkoutStore.setPaymentMethod).toHaveBeenCalledWith("cod");
  });
});
