import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ServiceOffering } from "@/lib/booking/types";
import { TermsBlock } from "./terms-block";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

const baseOffering = {
  id: "o-1",
  name: "Signature Facial",
  price_fils: 50_000, // AED 500.00
  payment_mode: "deposit",
  deposit_type: "percent",
  deposit_value: 20,
  cancellation_window_hours: 24,
  cancellation_refund_policy: "full",
  cancellation_penalty_percent: null,
  reschedule_window_hours: 12,
} as unknown as ServiceOffering;

function renderTerms(overrides: Partial<ServiceOffering> = {}) {
  return render(<TermsBlock offering={{ ...baseOffering, ...overrides } as ServiceOffering} />);
}

describe("TermsBlock payment-mode copy", () => {
  it("states the computed deposit amount in AED for a percent deposit", () => {
    renderTerms();

    // 20% of AED 500 = AED 100.00 — the customer must see AED, never 10000.
    const line = screen.getByText(/paymentModeDeposit/);
    expect(line).toHaveTextContent("AED 100.00");
    expect(line).not.toHaveTextContent("10000");
  });

  it("states a fixed deposit's fils value converted to AED", () => {
    renderTerms({ deposit_type: "fixed", deposit_value: 7_500 });

    expect(screen.getByText(/paymentModeDeposit/)).toHaveTextContent("AED 75.00");
    expect(screen.getByText(/depositFixed/)).toHaveTextContent("AED 75.00");
  });

  it("shows the percentage (not an amount) on the deposit detail line", () => {
    renderTerms();

    const line = screen.getByText(/depositPercent/);
    expect(line).toHaveTextContent('"percent":20');
  });

  it("uses prepay copy and shows no deposit line for a prepay offering", () => {
    renderTerms({ payment_mode: "prepay" });

    expect(screen.getByText(/paymentModePrepay/)).toBeInTheDocument();
    expect(screen.queryByText(/depositPercent|depositFixed/)).toBeNull();
  });

  it("uses pay-at-venue copy and shows no deposit line", () => {
    renderTerms({ payment_mode: "pay_at_venue" });

    expect(screen.getByText(/paymentModePayAtVenue/)).toBeInTheDocument();
    expect(screen.queryByText(/depositPercent|depositFixed/)).toBeNull();
  });

  it("omits the deposit detail line when deposit_type is 'none'", () => {
    renderTerms({ deposit_type: "none", deposit_value: 0 });

    expect(screen.queryByText(/depositPercent|depositFixed/)).toBeNull();
  });
});

describe("TermsBlock cancellation copy", () => {
  it("uses the full-refund copy with the window hours", () => {
    renderTerms({ cancellation_refund_policy: "full", cancellation_window_hours: 48 });

    expect(screen.getByText(/cancellationFull/)).toHaveTextContent('"hours":48');
  });

  it("uses the deposit-forfeit copy without inventing a percent", () => {
    renderTerms({ cancellation_refund_policy: "deposit_forfeit" });

    const line = screen.getByText(/cancellationDepositForfeit/);
    expect(line).toHaveTextContent('"hours":24');
    expect(line).not.toHaveTextContent("percent");
  });

  it("uses the percent copy with the configured penalty", () => {
    renderTerms({
      cancellation_refund_policy: "percent",
      cancellation_penalty_percent: 30,
    });

    expect(screen.getByText(/cancellationPercent/)).toHaveTextContent('"percent":30');
  });

  it("falls back to 0% rather than rendering 'null' when no penalty is configured", () => {
    renderTerms({
      cancellation_refund_policy: "percent",
      cancellation_penalty_percent: null,
    });

    const line = screen.getByText(/cancellationPercent/);
    expect(line).toHaveTextContent('"percent":0');
    expect(line).not.toHaveTextContent("null");
  });
});

describe("TermsBlock reschedule line", () => {
  it("shows the reschedule window when one is configured", () => {
    renderTerms({ reschedule_window_hours: 12 });

    expect(screen.getByText(/^reschedule /)).toHaveTextContent('"hours":12');
  });

  it("hides the reschedule line entirely when rescheduling is not offered", () => {
    renderTerms({ reschedule_window_hours: 0 });

    expect(screen.queryByText(/^reschedule /)).toBeNull();
  });
});
