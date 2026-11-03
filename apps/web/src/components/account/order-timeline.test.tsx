import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderTimeline } from "./order-timeline";

// next-intl `t` returns the key verbatim, so a step's label === its status key.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Steps completed before the current one render an SVG <title>Completed</title>.
const completedCount = () => screen.queryAllByTitle("Completed").length;

describe("OrderTimeline", () => {
  it("renders the four storefront steps", () => {
    render(<OrderTimeline currentStatus="placed" />);
    for (const step of ["placed", "shipped", "out_for_delivery", "delivered"]) {
      // getByText throws if the label is absent, so reaching here asserts it.
      expect(screen.getByText(step)).toBeTruthy();
    }
  });

  it("marks placed + shipped complete when out for delivery", () => {
    render(<OrderTimeline currentStatus="out_for_delivery" />);
    expect(completedCount()).toBe(2);
  });

  it("maps pre-shipment statuses (processing) onto the placed step", () => {
    render(<OrderTimeline currentStatus="processing" />);
    // placed is the current step, so nothing before it is complete
    expect(completedCount()).toBe(0);
  });

  it("maps partially_shipped onto the shipped step", () => {
    render(<OrderTimeline currentStatus="partially_shipped" />);
    // placed complete, shipped current
    expect(completedCount()).toBe(1);
  });

  it("marks every step complete, delivered included, when delivered", () => {
    render(<OrderTimeline currentStatus="delivered" />);
    expect(completedCount()).toBe(4);
  });

  describe("terminal statuses", () => {
    // vendor_orders.status is the full OrderStatus enum and order-status.service
    // sets `cancelled` on the vendor order, so these reach the storefront. A
    // progress bar with nothing lit reads as "nothing has happened yet", and the
    // order page carries no other status text to correct it.
    it.each([
      ["cancelled", "cancelled"],
      ["refunded", "refunded"],
      ["partially_refunded", "refunded"],
      ["returned", "returned"],
    ])("renders %s as a terminal label, not a progress bar", (status, label) => {
      render(<OrderTimeline currentStatus={status} />);
      expect(screen.getByText(label)).toBeTruthy();
      // None of the four progress milestones should be rendered at all.
      for (const step of ["placed", "shipped", "out_for_delivery", "delivered"]) {
        expect(screen.queryByText(step)).toBeNull();
      }
    });

    it("still renders the progress bar for in-flight statuses", () => {
      render(<OrderTimeline currentStatus="shipped" />);
      expect(screen.getByText("placed")).toBeTruthy();
      expect(screen.queryByText("cancelled")).toBeNull();
    });
  });
});
