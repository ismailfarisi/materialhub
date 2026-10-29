import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateBookingResponse } from "@/lib/booking/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

// --- Stripe stand-ins -------------------------------------------------------
// No network, no real Elements. `elementsOptions` is captured so the test can
// assert what amount the card form was mounted with.
const confirmCardPayment = vi.fn();
const confirmCardSetup = vi.fn();
const capturedElementsProps: { current: Record<string, unknown> | null } = { current: null };
const cardElementPresent = { value: true };

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: () => Promise.resolve(null),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: (props: { children: ReactNode } & Record<string, unknown>) => {
    capturedElementsProps.current = props;
    return <div data-testid="stripe-elements">{props.children}</div>;
  },
  CardElement: () => <div data-testid="card-element" />,
  useStripe: () => ({ confirmCardPayment, confirmCardSetup }),
  useElements: () => ({
    getElement: () => (cardElementPresent.value ? { id: "card" } : null),
  }),
}));

import { BookingPayment, type BookingPaymentProps } from "./booking-payment";

const bookingResponse = {
  booking: { id: "bk-1", deposit_fils: 10_000 },
  client_secret: "cs_test_123",
  payment_intent_id: "pi_1",
  setup_intent_id: null,
} as unknown as CreateBookingResponse;

function renderPayment(overrides: Partial<BookingPaymentProps> = {}) {
  const props: BookingPaymentProps = {
    paymentMode: "deposit",
    depositFils: 10_000, // AED 100.00
    locale: "en",
    billingName: "Sara Customer",
    billingPhone: "+971500000001",
    disabled: false,
    onCreate: vi.fn().mockResolvedValue(bookingResponse),
    onConfirmed: vi.fn(),
    onFailed: vi.fn(),
    ...overrides,
  };
  return { ...render(<BookingPayment {...props} />), props };
}

beforeEach(() => {
  confirmCardPayment.mockReset();
  confirmCardSetup.mockReset();
  capturedElementsProps.current = null;
  cardElementPresent.value = true;
});

describe("BookingPayment copy and amounts", () => {
  it("shows the deposit amount in AED on the title, note and button", () => {
    renderPayment({ depositFils: 10_000 });

    expect(screen.getByText(/depositCardTitle/)).toHaveTextContent("AED 100.00");
    expect(screen.getByText(/depositConfirmNote/)).toHaveTextContent("AED 100.00");
    expect(screen.getByText(/payDeposit/)).toHaveTextContent("AED 100.00");
    // Raw fils must never leak into customer-facing copy.
    expect(screen.getByText(/payDeposit/)).not.toHaveTextContent("10000");
  });

  it("prefers the backend-confirmed deposit over the client estimate once known", () => {
    renderPayment({ depositFils: 10_000, confirmedDepositFils: 12_500 });

    expect(screen.getByText(/payDeposit/)).toHaveTextContent("AED 125.00");
    expect(screen.getByText(/payDeposit/)).not.toHaveTextContent("AED 100.00");
  });

  it("mounts Stripe Elements in payment mode for the exact deposit amount", () => {
    renderPayment({ paymentMode: "deposit", depositFils: 10_000 });

    expect(capturedElementsProps.current?.options).toMatchObject({
      mode: "payment",
      currency: "aed",
      amount: 10_000,
    });
  });

  it("keeps a zero-deposit Elements amount at the Stripe minimum of 1", () => {
    renderPayment({ paymentMode: "deposit", depositFils: 0 });

    expect(capturedElementsProps.current?.options).toMatchObject({ amount: 1 });
  });

  it("mounts Stripe Elements in setup mode with no amount for prepay", () => {
    renderPayment({ paymentMode: "prepay" });

    expect(capturedElementsProps.current?.options).toMatchObject({
      mode: "setup",
      currency: "aed",
    });
    expect(capturedElementsProps.current?.options).not.toHaveProperty("amount");
  });

  it("shows save-card copy (never a charge amount) for prepay", () => {
    renderPayment({ paymentMode: "prepay", depositFils: 10_000 });

    expect(screen.getByText("prepayCardTitle")).toBeInTheDocument();
    expect(screen.getByText("saveCardConfirm")).toBeInTheDocument();
    expect(screen.queryByText(/payDeposit/)).toBeNull();
    expect(screen.queryByText(/AED 100\.00/)).toBeNull();
  });
});

describe("BookingPayment submission", () => {
  it("charges the card for a deposit booking and reports confirmation", async () => {
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "succeeded" } });
    const { props } = renderPayment({ paymentMode: "deposit" });

    fireEvent.click(screen.getByText(/payDeposit/));

    await waitFor(() => expect(props.onConfirmed).toHaveBeenCalledWith("bk-1"));
    expect(confirmCardPayment).toHaveBeenCalledTimes(1);
    expect(confirmCardSetup).not.toHaveBeenCalled();
  });

  it("only SAVES the card for a prepay booking — it never charges now", async () => {
    confirmCardSetup.mockResolvedValue({ setupIntent: { status: "succeeded" } });
    const { props } = renderPayment({ paymentMode: "prepay" });

    fireEvent.click(screen.getByText("saveCardConfirm"));

    await waitFor(() => expect(props.onConfirmed).toHaveBeenCalledWith("bk-1"));
    expect(confirmCardSetup).toHaveBeenCalledTimes(1);
    expect(confirmCardPayment).not.toHaveBeenCalled();
  });

  it("blocks a same-frame double-tap from creating two bookings", async () => {
    // Hold onCreate open so both clicks land before any state re-render.
    let releaseCreate: (value: CreateBookingResponse) => void = () => {};
    const onCreate = vi.fn(
      () =>
        new Promise<CreateBookingResponse>((resolve) => {
          releaseCreate = resolve;
        }),
    );
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "succeeded" } });
    const { props } = renderPayment({ onCreate });

    const button = screen.getByText(/payDeposit/);
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onCreate).toHaveBeenCalledTimes(1);

    releaseCreate(bookingResponse);
    await waitFor(() => expect(props.onConfirmed).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(confirmCardPayment).toHaveBeenCalledTimes(1);
  });

  it("does nothing further when the parent's create call already failed", async () => {
    const onCreate = vi.fn().mockResolvedValue(null);
    const { props } = renderPayment({ onCreate });

    fireEvent.click(screen.getByText(/payDeposit/));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(confirmCardPayment).not.toHaveBeenCalled();
    expect(props.onConfirmed).not.toHaveBeenCalled();
    expect(props.onFailed).not.toHaveBeenCalled();
  });

  it("reports a failure when the booking has no client secret to confirm", async () => {
    const onCreate = vi.fn().mockResolvedValue({ ...bookingResponse, client_secret: null });
    const { props } = renderPayment({ onCreate });

    fireEvent.click(screen.getByText(/payDeposit/));

    await waitFor(() => expect(props.onFailed).toHaveBeenCalledWith("paymentFailed"));
    expect(props.onConfirmed).not.toHaveBeenCalled();
  });

  it("surfaces the Stripe decline message rather than a generic one", async () => {
    confirmCardPayment.mockResolvedValue({ error: { message: "Your card was declined." } });
    const { props } = renderPayment();

    fireEvent.click(screen.getByText(/payDeposit/));

    await waitFor(() => expect(props.onFailed).toHaveBeenCalledWith("Your card was declined."));
    expect(props.onConfirmed).not.toHaveBeenCalled();
  });

  it("treats a still-processing PaymentIntent as confirmed", async () => {
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "processing" } });
    const { props } = renderPayment();

    fireEvent.click(screen.getByText(/payDeposit/));

    await waitFor(() => expect(props.onConfirmed).toHaveBeenCalledWith("bk-1"));
  });

  it("does NOT treat a requires_action PaymentIntent as confirmed", async () => {
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "requires_action" } });
    const { props } = renderPayment();

    fireEvent.click(screen.getByText(/payDeposit/));

    await waitFor(() => expect(props.onFailed).toHaveBeenCalledWith("paymentFailed"));
    expect(props.onConfirmed).not.toHaveBeenCalled();
  });

  it("does NOT treat an unfinished SetupIntent as confirmed for prepay", async () => {
    confirmCardSetup.mockResolvedValue({ setupIntent: { status: "requires_payment_method" } });
    const { props } = renderPayment({ paymentMode: "prepay" });

    fireEvent.click(screen.getByText("saveCardConfirm"));

    await waitFor(() => expect(props.onFailed).toHaveBeenCalledWith("paymentFailed"));
    expect(props.onConfirmed).not.toHaveBeenCalled();
  });

  it("refuses to create a booking when no card has been entered, and stays retryable", async () => {
    cardElementPresent.value = false;
    const { props } = renderPayment();

    fireEvent.click(screen.getByText(/payDeposit/));

    await waitFor(() => expect(screen.getByText("cardNotEntered")).toBeInTheDocument());
    expect(props.onCreate).not.toHaveBeenCalled();

    // The re-entrancy lock must have been released so the customer can retry.
    cardElementPresent.value = true;
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "succeeded" } });
    fireEvent.click(screen.getByText(/payDeposit/));
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledTimes(1));
  });

  it("cannot be submitted while the parent reports the form as disabled", () => {
    const { props } = renderPayment({ disabled: true });

    const button = screen.getByText(/payDeposit/).closest("button");
    expect(button).toBeDisabled();
    fireEvent.click(button as HTMLElement);
    expect(props.onCreate).not.toHaveBeenCalled();
  });
});
