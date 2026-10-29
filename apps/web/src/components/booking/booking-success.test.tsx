import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Booking } from "@/lib/booking/types";
import { BookingSuccess } from "./booking-success";

// Interpolate params into the key so the test can assert on the FORMATTED
// money strings the customer actually sees, not just which key was picked.
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}));

const baseBooking = {
  id: "b-1",
  booking_number: "BK-1001",
  service_name: "Signature Facial",
  starts_at: "2026-03-10T06:00:00.000Z",
  ends_at: "2026-03-10T07:00:00.000Z",
  price_fils: 45_000, // AED 450.00
  deposit_fils: 10_000, // AED 100.00
  payment_mode: "deposit",
} as unknown as Booking;

function renderSuccess(booking: Booking) {
  return render(
    <BookingSuccess
      locale="en"
      booking={booking}
      staffMember={null}
      locationRecord={null}
      customerAreaName={null}
      tz="Asia/Dubai"
    />,
  );
}

describe("BookingSuccess charged copy", () => {
  it("shows the deposit charged and the remaining balance for a deposit booking", () => {
    renderSuccess(baseBooking);

    // AED 450 price, AED 100 deposit => AED 350 balance due at the venue.
    const copy = screen.getByText(/successChargedDeposit/);
    expect(copy).toHaveTextContent("AED 100.00");
    expect(copy).toHaveTextContent("AED 350.00");
    // Raw fils must never reach the screen.
    expect(copy).not.toHaveTextContent("45000");
    expect(copy).not.toHaveTextContent("10000");
  });

  it("never shows a negative balance when the deposit covers the whole price", () => {
    renderSuccess({ ...baseBooking, deposit_fils: 45_000 } as Booking);

    const copy = screen.getByText(/successChargedDeposit/);
    expect(copy).toHaveTextContent("AED 0.00");
    expect(copy).not.toHaveTextContent("-");
  });

  it("shows the full price for a prepay booking", () => {
    renderSuccess({ ...baseBooking, payment_mode: "prepay" } as Booking);

    const copy = screen.getByText(/successChargedPrepay/);
    expect(copy).toHaveTextContent("AED 450.00");
    expect(screen.queryByText(/successChargedDeposit/)).toBeNull();
  });

  it("shows the full price as payable at the venue for a pay_at_venue booking", () => {
    renderSuccess({ ...baseBooking, payment_mode: "pay_at_venue" } as Booking);

    const copy = screen.getByText(/successChargedPayAtVenue/);
    expect(copy).toHaveTextContent("AED 450.00");
    expect(screen.queryByText(/successChargedDeposit/)).toBeNull();
    expect(screen.queryByText(/successChargedPrepay/)).toBeNull();
  });

  it("renders the appointment window in the booking's timezone, not the browser's", () => {
    renderSuccess(baseBooking);

    // 06:00Z-07:00Z is 10:00-11:00 in Asia/Dubai.
    const row = screen.getByText(/10:00/);
    expect(row).toHaveTextContent("11:00");
    expect(row).not.toHaveTextContent("6:00");
  });

  it("shows the booking number so the customer can quote it to the vendor", () => {
    renderSuccess(baseBooking);

    expect(screen.getByText("BK-1001")).toBeInTheDocument();
  });
});
