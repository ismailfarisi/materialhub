import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityResponse, VendorLocation } from "@/lib/booking/types";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// Controllable query stand-ins — no network.
const availabilityResult: {
  current: { data: AvailabilityResponse | undefined; isPending: boolean; isError: boolean };
} = { current: { data: undefined, isPending: true, isError: false } };
const capturedAvailabilityArgs: { current: unknown[] } = { current: [] };

vi.mock("@/lib/queries/booking", () => ({
  useAvailability: (...args: unknown[]) => {
    capturedAvailabilityArgs.current = args;
    return { ...availabilityResult.current, refetch: vi.fn() };
  },
  useOfferingStaff: () => ({ data: [], isPending: false, isError: false }),
}));

vi.mock("@/lib/queries/areas", () => ({
  useAreas: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
}));

import { AvailabilityPicker } from "./availability-picker";

const DUBAI = "Asia/Dubai"; // UTC+4, no DST

const DUBAI_LOCATION = {
  id: "loc-1",
  vendor_id: "v-1",
  name: "Jumeirah Branch",
  timezone: DUBAI,
  is_active: true,
} as unknown as VendorLocation;

/**
 * Slots on 2026-03-10 Dubai time. Note the last one: 20:30Z is 00:30 on
 * 2026-03-11 in Dubai, so it must NOT appear on the 10th.
 */
function availability(overrides: Partial<AvailabilityResponse> = {}): AvailabilityResponse {
  return {
    offering_id: "o-1",
    timezone: DUBAI,
    mode: "at_premises",
    slots: [
      { start: "2026-03-10T05:00:00.000Z", end: "2026-03-10T06:00:00.000Z", staff_options: ["s1"] }, // 09:00 Dubai
      { start: "2026-03-10T10:00:00.000Z", end: "2026-03-10T11:00:00.000Z", staff_options: ["s1"] }, // 14:00 Dubai
      { start: "2026-03-10T15:00:00.000Z", end: "2026-03-10T16:00:00.000Z", staff_options: ["s1"] }, // 19:00 Dubai
      { start: "2026-03-10T20:30:00.000Z", end: "2026-03-10T21:30:00.000Z", staff_options: ["s1"] }, // 00:30 Dubai on the 11th
    ],
    ...overrides,
  };
}

function renderPicker(props: Partial<Parameters<typeof AvailabilityPicker>[0]> = {}) {
  return render(
    <AvailabilityPicker
      offeringId="o-1"
      offeringSlug="signature-facial"
      locationMode="at_premises"
      locations={[DUBAI_LOCATION]}
      maxAdvanceDays={60}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Browser clock is deliberately set to an instant where the UTC date and
  // the Dubai date DISAGREE: 21:00Z on the 9th is already the 10th in Dubai.
  vi.setSystemTime(new Date("2026-03-09T21:00:00.000Z"));
  push.mockReset();
  availabilityResult.current = { data: availability(), isPending: false, isError: false };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AvailabilityPicker day window", () => {
  it("starts the day strip on TODAY in the offering's timezone, not the browser's UTC day", () => {
    renderPicker();

    // Dubai is already on the 10th; a UTC-derived window would start on the 9th.
    const [, params] = capturedAvailabilityArgs.current as [string, { from: string; to: string }];
    expect(params.from).toBe("2026-03-10");
    expect(params.to).toBe("2026-03-24"); // a 14-day window
  });

  it("offers exactly 14 consecutive days", () => {
    renderPicker();

    // Day numbers 10..23 of March.
    for (const day of [10, 11, 12, 20, 23]) {
      expect(screen.getAllByText(String(day)).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("24")).toBeNull();
  });

  it("captions the grid with the timezone the times are rendered in", () => {
    renderPicker();

    expect(screen.getByText(/timezoneNote/)).toHaveTextContent("Asia/Dubai");
  });
});

describe("AvailabilityPicker slot rendering", () => {
  it("renders slot times as the offering's local wall clock, not UTC", () => {
    renderPicker();

    // 05:00Z must read as 9:00 AM in Dubai — never 5:00.
    expect(screen.getByText(/^9:00/)).toBeInTheDocument();
    expect(screen.getByText(/^2:00/)).toBeInTheDocument();
    expect(screen.getByText(/^7:00/)).toBeInTheDocument();
    expect(screen.queryByText(/^5:00/)).toBeNull();
  });

  it("files a late-evening UTC slot under the NEXT day in the offering's timezone", () => {
    renderPicker();

    // 20:30Z is 00:30 Dubai on the 11th, so it must not be on the 10th's grid.
    expect(screen.queryByText(/^12:30/)).toBeNull();

    // Selecting the 11th surfaces it.
    fireEvent.click(screen.getByText("11").closest("button") as HTMLElement);
    expect(screen.getByText(/^12:30/)).toBeInTheDocument();
  });

  it("buckets slots into morning/afternoon/evening by the offering's local hour", () => {
    renderPicker();

    const morning = screen.getByText("morning").parentElement as HTMLElement;
    const afternoon = screen.getByText("afternoon").parentElement as HTMLElement;
    const evening = screen.getByText("evening").parentElement as HTMLElement;

    expect(within(morning).getByText(/^9:00/)).toBeInTheDocument(); // 09:00 Dubai
    expect(within(afternoon).getByText(/^2:00/)).toBeInTheDocument(); // 14:00 Dubai
    expect(within(evening).getByText(/^7:00/)).toBeInTheDocument(); // 19:00 Dubai
  });

  it("shows an empty-day state for a day with no openings", () => {
    renderPicker();

    fireEvent.click(screen.getByText("12").closest("button") as HTMLElement);
    expect(screen.queryByText("morning")).toBeNull();
  });
});

describe("AvailabilityPicker continue handoff", () => {
  it("keeps Continue disabled until a slot is chosen", () => {
    renderPicker();

    const button = screen.getByText("continue").closest("button") as HTMLElement;
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByText(/^9:00/));
    expect(button).not.toBeDisabled();
  });

  it("hands off the exact UTC instants plus the resolved timezone", () => {
    renderPicker();

    fireEvent.click(screen.getByText(/^9:00/));
    fireEvent.click(screen.getByText("continue"));

    expect(push).toHaveBeenCalledTimes(1);
    const href = push.mock.calls[0][0] as string;
    const query = new URLSearchParams(href.split("?")[1]);

    // The wire values must be the raw ISO instants, never the localised label.
    expect(query.get("start")).toBe("2026-03-10T05:00:00.000Z");
    expect(query.get("end")).toBe("2026-03-10T06:00:00.000Z");
    expect(query.get("tz")).toBe(DUBAI);
    expect(query.get("location")).toBe("loc-1");
    expect(href).toContain("/book/signature-facial");
  });

  it("does not navigate when Continue is pressed with nothing selected", () => {
    renderPicker();

    fireEvent.click(screen.getByText("continue"));
    expect(push).not.toHaveBeenCalled();
  });

  it("routes through a caller-supplied href builder (reschedule flow)", () => {
    renderPicker({
      buildContinueHref: (params) => `/en/account/bookings/bk-1/reschedule?${params.toString()}`,
    });

    fireEvent.click(screen.getByText(/^9:00/));
    fireEvent.click(screen.getByText("continue"));

    const href = push.mock.calls[0][0] as string;
    expect(href).toContain("/account/bookings/bk-1/reschedule");
    expect(new URLSearchParams(href.split("?")[1]).get("start")).toBe(
      "2026-03-10T05:00:00.000Z",
    );
  });
});

describe("AvailabilityPicker booking horizon", () => {
  it("blocks paging past the offering's max advance days", () => {
    // maxAdvanceDays 14 means the very next 14-day window is already beyond
    // the bookable horizon.
    renderPicker({ maxAdvanceDays: 14 });

    expect(screen.getByLabelText("later")).toBeDisabled();
  });

  it("allows paging forward when the horizon is far enough out", () => {
    renderPicker({ maxAdvanceDays: 60 });

    expect(screen.getByLabelText("later")).not.toBeDisabled();
    expect(screen.getByLabelText("earlier")).toBeDisabled(); // already at window 0
  });
});

describe("AvailabilityPicker selection persistence across refetches", () => {
  /**
   * `refetchOnWindowFocus` defaults to true (providers.tsx only sets
   * staleTime/retry) and staleTime is 30s, so tabbing away and back — or
   * app-switching on mobile — re-resolves the availability query. An
   * unconditional `setSelectedSlot(null)` in the post-resolve effect wiped
   * the customer's choice with no message and greyed out Continue.
   */
  function rerenderWithAvailability(
    rerender: ReturnType<typeof render>["rerender"],
    next: AvailabilityResponse,
  ) {
    // New object identity, same query key — exactly what a background
    // refetch produces.
    availabilityResult.current = { data: next, isPending: false, isError: false };
    rerender(
      <AvailabilityPicker
        offeringId="o-1"
        offeringSlug="signature-facial"
        locationMode="at_premises"
        locations={[DUBAI_LOCATION]}
        maxAdvanceDays={60}
      />,
    );
  }

  it("keeps the chosen slot when a background refetch still offers it", () => {
    const { rerender } = renderPicker();

    fireEvent.click(screen.getByText(/^9:00/));
    const button = screen.getByText("continue").closest("button") as HTMLElement;
    expect(button).not.toBeDisabled();

    // Same slots, brand-new object — the window-focus refetch case.
    rerenderWithAvailability(rerender, availability());

    expect(screen.getByText("continue").closest("button")).not.toBeDisabled();

    fireEvent.click(screen.getByText("continue"));
    expect(new URLSearchParams((push.mock.calls[0][0] as string).split("?")[1]).get("start")).toBe(
      "2026-03-10T05:00:00.000Z",
    );
  });

  it("clears the chosen slot when the refetch shows it was taken", () => {
    const { rerender } = renderPicker();

    fireEvent.click(screen.getByText(/^9:00/));
    expect(screen.getByText("continue").closest("button")).not.toBeDisabled();

    // Someone else booked 09:00 Dubai — it's genuinely gone now.
    const withoutNine = availability({
      slots: availability().slots.filter((s) => s.start !== "2026-03-10T05:00:00.000Z"),
    });
    rerenderWithAvailability(rerender, withoutNine);

    expect(screen.getByText("continue").closest("button")).toBeDisabled();
  });
});
