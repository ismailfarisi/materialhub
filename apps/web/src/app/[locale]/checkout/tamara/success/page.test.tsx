import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
// A real UUID — matches order.entity.ts's @PrimaryGeneratedColumn("uuid").
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000";
// Reassigned (not rebuilt) per test in beforeEach/individual tests — a new
// object per RENDER would make any effect depending on it re-fire forever
// and crash the vitest worker, but a stable object swapped between tests is
// fine.
let searchParams = new URLSearchParams(`order=${ORDER_ID}`);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const mockOrderResult: { current: { data: unknown; isLoading: boolean } } = {
  current: { data: undefined, isLoading: true },
};
vi.mock("@/lib/queries/orders", () => ({
  useOrder: () => mockOrderResult.current,
}));

import TamaraSuccessPage from "./page";

describe("Tamara success interstitial", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    vi.useFakeTimers();
    mockOrderResult.current = { data: undefined, isLoading: true };
    searchParams = new URLSearchParams(`order=${ORDER_ID}`);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the confirming state while payment is pending", () => {
    mockOrderResult.current = {
      data: { id: ORDER_ID, payment_status: "pending" },
      isLoading: false,
    };
    render(<TamaraSuccessPage />);
    expect(screen.getByText("tamaraConfirming")).toBeTruthy();
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent("tamaraConfirming");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("forwards to the order page once the payment is confirmed", () => {
    mockOrderResult.current = {
      data: { id: ORDER_ID, payment_status: "captured" },
      isLoading: false,
    };
    render(<TamaraSuccessPage />);
    expect(mockReplace).toHaveBeenCalledWith(`/en/account/orders/${ORDER_ID}`);
  });

  // minor 3: "authorized" is a real PaymentStatus value but is only ever
  // written to the Payment row, never to Order.payment_status (verified
  // against payment.enums.ts and every order-service writer of
  // payment_status) — it must NOT be treated as confirmed here.
  it("keeps waiting when payment_status is authorized (never actually written to Order.payment_status)", () => {
    mockOrderResult.current = {
      data: { id: ORDER_ID, payment_status: "authorized" },
      isLoading: false,
    };
    render(<TamaraSuccessPage />);
    expect(screen.getByText("tamaraConfirming")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows the slow state after the polling window elapses", async () => {
    mockOrderResult.current = {
      data: { id: ORDER_ID, payment_status: "pending" },
      isLoading: false,
    };
    render(<TamaraSuccessPage />);
    // React 18's scheduler flushes timer-driven state updates via a
    // MessageChannel/setTimeout(0) hop, which is itself faked by
    // vi.useFakeTimers(); wrap in act() so the flush actually happens before
    // we assert (same pattern as mega-menu-root.test.tsx).
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("tamaraSlow")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // minor 4 (fix-before-merge — C1 made this path far more likely than an
  // edge case): a missing `?order=` renders the give-up state immediately
  // and links to the orders list, never polls.
  it("gives up immediately and links to the orders list when ?order= is missing", () => {
    searchParams = new URLSearchParams("");
    render(<TamaraSuccessPage />);
    expect(screen.getByText("tamaraSlow")).toBeTruthy();
    const link = screen.getByText("tamaraViewOrders").closest("a");
    expect(link?.getAttribute("href")).toBe("/en/account/orders");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // minor 5: defensive against Tamara appending its own query params to the
  // merchant success URL — a malformed `order` value must be treated as
  // missing (give-up state), not fed to /buyer/orders/:id (which requires a
  // UUID and would 400).
  it("treats a malformed ?order= value the same as a missing one", () => {
    searchParams = new URLSearchParams("order=<script>alert(1)</script>");
    render(<TamaraSuccessPage />);
    expect(screen.getByText("tamaraSlow")).toBeTruthy();
    const link = screen.getByText("tamaraViewOrders").closest("a");
    expect(link?.getAttribute("href")).toBe("/en/account/orders");
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
