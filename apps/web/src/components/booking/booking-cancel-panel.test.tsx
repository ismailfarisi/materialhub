import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, CancelBookingResponse } from "@/lib/booking/types";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

// Controllable mutation stand-in for POST /bookings/:id/cancel — no network.
const mutateAsync = vi.fn();
const mutationState = { isPending: false };
vi.mock("@/lib/queries/booking", () => ({
  useCancelBooking: () => ({
    mutateAsync,
    get isPending() {
      return mutationState.isPending;
    },
  }),
}));

import { BookingCancelPanel } from "./booking-cancel-panel";

const STARTS_AT = "2026-08-01T10:00:00.000Z";

const baseBooking = {
  id: "bk-1",
  booking_number: "BK-1001",
  starts_at: STARTS_AT,
  cancellation_window_hours: 24,
  cancellation_refund_policy: "percent",
  cancellation_penalty_percent: 50,
  deposit_fils: 10_000, // AED 100.00
  price_fils: 40_000, // AED 400.00
  payment_mode: "deposit",
  amount_paid_fils: 0,
  escrow_hold_id: null,
} as unknown as Booking;

/** Freeze the clock at `hours` before the appointment start. */
function freezeAtHoursBeforeStart(hours: number) {
  vi.setSystemTime(new Date(new Date(STARTS_AT).getTime() - hours * 60 * 60 * 1000));
}

function renderPanel(overrides: Partial<Booking> = {}, onCancelled = vi.fn()) {
  const result = render(
    <BookingCancelPanel
      booking={{ ...baseBooking, ...overrides } as Booking}
      onCancelled={onCancelled}
    />,
  );
  return { ...result, onCancelled };
}

function expand() {
  fireEvent.click(screen.getByText("trigger"));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mutateAsync.mockReset();
  mutationState.isPending = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BookingCancelPanel estimate copy", () => {
  it("promises a full deposit refund when cancelling inside the window", () => {
    freezeAtHoursBeforeStart(48);
    renderPanel();
    expand();

    const copy = screen.getByText(/estimateFullRefund/);
    expect(copy).toHaveTextContent("AED 100.00");
    expect(screen.queryByText(/estimatePenaltyPercent/)).toBeNull();
  });

  it("switches to a penalty estimate once the window has closed", () => {
    freezeAtHoursBeforeStart(1);
    renderPanel();
    expand();

    // 50% of the AED 100 deposit — NOT 50% of the AED 400 price.
    const copy = screen.getByText(/estimatePenaltyPercent/);
    expect(copy).toHaveTextContent("AED 50.00");
    expect(copy).toHaveTextContent('"percent":50');
    expect(copy).not.toHaveTextContent("AED 200.00");
  });

  it("still promises a full refund at the exact window boundary instant", () => {
    freezeAtHoursBeforeStart(24);
    renderPanel();
    expand();

    expect(screen.getByText(/estimateFullRefund/)).toBeInTheDocument();
  });

  it("says no charge for a pay_at_venue booking even outside the window", () => {
    freezeAtHoursBeforeStart(1);
    renderPanel({ payment_mode: "pay_at_venue" } as Partial<Booking>);
    expand();

    expect(screen.getByText("estimateNoCharge")).toBeInTheDocument();
  });

  it("hedges the prepay penalty as a conditional range", () => {
    freezeAtHoursBeforeStart(1);
    renderPanel({ payment_mode: "prepay" } as Partial<Booking>);
    expand();

    // 50% of the AED 400 price, framed as an "up to" ceiling.
    const copy = screen.getByText(/estimatePenaltyPercentPrepayConditional/);
    expect(copy).toHaveTextContent("AED 200.00");
  });

  it("always labels the figure as an estimate, not a final amount", () => {
    freezeAtHoursBeforeStart(1);
    renderPanel();
    expand();

    expect(screen.getByText("estimateNote")).toBeInTheDocument();
  });
});

describe("BookingCancelPanel confirm flow", () => {
  const serverResult: CancelBookingResponse = {
    booking: { ...baseBooking, status: "cancelled" } as Booking,
    within_window: false,
    refund_fils: 5_000,
    forfeit_fils: 5_000,
    action: "refund",
  };

  it("does not fire the cancel request until the panel is expanded and confirmed", () => {
    freezeAtHoursBeforeStart(1);
    renderPanel();

    expect(mutateAsync).not.toHaveBeenCalled();
    expand();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("hands the SERVER's outcome to onCancelled, not the client estimate", async () => {
    freezeAtHoursBeforeStart(1);
    mutateAsync.mockResolvedValue(serverResult);
    const { onCancelled } = renderPanel();
    expand();

    fireEvent.click(screen.getByText("confirmButton"));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(onCancelled).toHaveBeenCalledWith(serverResult);
  });

  it("sends a trimmed reason, and omits it entirely when blank", async () => {
    freezeAtHoursBeforeStart(1);
    mutateAsync.mockResolvedValue(serverResult);
    renderPanel();
    expand();

    fireEvent.change(screen.getByLabelText("reasonLabel"), {
      target: { value: "   changed my plans   " },
    });
    fireEvent.click(screen.getByText("confirmButton"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      bookingId: "bk-1",
      body: { reason: "changed my plans" },
    });
  });

  it("omits a whitespace-only reason rather than sending blanks", async () => {
    freezeAtHoursBeforeStart(1);
    mutateAsync.mockResolvedValue(serverResult);
    renderPanel();
    expand();

    fireEvent.change(screen.getByLabelText("reasonLabel"), { target: { value: "    " } });
    fireEvent.click(screen.getByText("confirmButton"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      bookingId: "bk-1",
      body: { reason: undefined },
    });
  });

  it("disables BOTH buttons while the cancel request is in flight", () => {
    freezeAtHoursBeforeStart(1);
    mutationState.isPending = true;
    renderPanel();
    expand();

    // A second click must not be able to fire a duplicate cancel/refund.
    expect(screen.getByText("loading").closest("button")).toBeDisabled();
    expect(screen.getByText("dismissButton").closest("button")).toBeDisabled();
  });

  it("surfaces the backend's error message and does not report a cancellation", async () => {
    freezeAtHoursBeforeStart(1);
    mutateAsync.mockRejectedValue({
      response: { data: { message: "Booking already cancelled" } },
    });
    const { onCancelled } = renderPanel();
    expand();

    fireEvent.click(screen.getByText("confirmButton"));

    await waitFor(() =>
      expect(screen.getByText("Booking already cancelled")).toBeInTheDocument(),
    );
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it("falls back to generic copy when the backend gives no message", async () => {
    freezeAtHoursBeforeStart(1);
    mutateAsync.mockRejectedValue({});
    renderPanel();
    expand();

    fireEvent.click(screen.getByText("confirmButton"));

    await waitFor(() => expect(screen.getByText("genericError")).toBeInTheDocument());
  });

  it("collapses back to the trigger when dismissed, without cancelling", () => {
    freezeAtHoursBeforeStart(1);
    renderPanel();
    expand();

    fireEvent.click(screen.getByText("dismissButton"));

    expect(screen.getByText("trigger")).toBeInTheDocument();
    expect(screen.queryByText("confirmButton")).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
