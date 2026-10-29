import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
// A real UUID — matches order.entity.ts's @PrimaryGeneratedColumn("uuid").
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000";
let searchParams = new URLSearchParams(`order=${ORDER_ID}`);
const mockPost = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/lib/api", () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

import { TamaraResultCard } from "./tamara-result-card";

describe("TamaraResultCard", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockPost.mockReset();
    searchParams = new URLSearchParams(`order=${ORDER_ID}`);
    // jsdom has no navigation; make the assignment observable instead.
    Object.defineProperty(window, "location", {
      value: { origin: "https://www.materialhub.test", href: "" },
      writable: true,
    });
  });

  it("renders failure copy for the failure variant", () => {
    render(<TamaraResultCard variant="failure" />);
    expect(screen.getByText("tamaraFailureTitle")).toBeTruthy();
  });

  it("renders cancel copy for the cancel variant", () => {
    render(<TamaraResultCard variant="cancel" />);
    expect(screen.getByText("tamaraCancelTitle")).toBeTruthy();
  });

  it("restarts the Tamara session and redirects to the new checkout URL", async () => {
    mockPost.mockResolvedValue({
      data: { data: { checkoutUrl: "https://checkout.tamara.co/session/new-1" } },
    });

    render(<TamaraResultCard variant="failure" />);
    fireEvent.click(screen.getByText("tamaraRetry"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/checkout/tamara",
        expect.objectContaining({ order_id: ORDER_ID }),
      );
    });
    await waitFor(() => {
      expect(window.location.href).toBe("https://checkout.tamara.co/session/new-1");
    });
  });

  it("surfaces an error inline when the retry fails", async () => {
    mockPost.mockRejectedValue(new Error("boom"));

    render(<TamaraResultCard variant="failure" />);
    fireEvent.click(screen.getByText("tamaraRetry"));

    await waitFor(() => {
      expect(screen.getByText("tamaraRetryFailed")).toBeTruthy();
    });
  });

  it("sends the customer to checkout for another payment method", () => {
    render(<TamaraResultCard variant="failure" />);
    fireEvent.click(screen.getByText("tamaraOtherMethod"));
    expect(mockPush).toHaveBeenCalledWith("/en/checkout");
  });

  // C2: order-service now rejects a retry on an order that's no longer
  // payable (409 ORDER_NOT_PAYABLE) — e.g. pending-order-reaper cancelled it
  // while the customer sat on this page. The generic "couldn't restart"
  // copy is misleading here (retrying again would just repeat the same
  // 409); show distinct copy and route back to checkout.
  it("shows the order-expired copy and routes to checkout on a 409 ORDER_NOT_PAYABLE retry response", async () => {
    mockPost.mockRejectedValue({
      response: { status: 409, data: { error: "ORDER_NOT_PAYABLE" } },
    });

    render(<TamaraResultCard variant="failure" />);
    fireEvent.click(screen.getByText("tamaraRetry"));

    await waitFor(() => {
      expect(screen.getByText("tamaraOrderExpired")).toBeTruthy();
    });
    expect(screen.queryByText("tamaraRetryFailed")).toBeNull();
    expect(mockPush).toHaveBeenCalledWith("/en/checkout");
  });

  // minor 5: defensive against Tamara appending its own query params to the
  // merchant failure/cancel URL — a malformed `order` value must be treated
  // as missing, not fed to /checkout/tamara or /buyer/orders/:id (which
  // requires a UUID and would 400).
  it("treats a malformed order id the same as a missing one and routes to checkout without calling the API", () => {
    searchParams = new URLSearchParams("order=not-a-real-uuid");

    render(<TamaraResultCard variant="failure" />);
    fireEvent.click(screen.getByText("tamaraRetry"));

    expect(mockPush).toHaveBeenCalledWith("/en/checkout");
    expect(mockPost).not.toHaveBeenCalled();
  });
});
