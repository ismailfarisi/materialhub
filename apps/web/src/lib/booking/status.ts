import type { BookingStatus } from "./types";

/**
 * Badge tone for each of the 7 BookingStatus values — mirrors the
 * order-status badge's traffic-light convention (order detail page: green
 * for a terminal-success state, red for terminal-failure, amber for
 * in-flight) rather than inventing a new palette.
 */
export type BookingStatusTone = "amber" | "green" | "red" | "neutral";

const TONES: Record<BookingStatus, BookingStatusTone> = {
  pending_payment: "amber",
  confirmed: "amber",
  rescheduled: "amber",
  cancelled: "red",
  completed: "green",
  no_show: "red",
  expired: "neutral",
};

export function bookingStatusTone(status: BookingStatus): BookingStatusTone {
  return TONES[status] ?? "neutral";
}

export const BOOKING_STATUS_BADGE_STYLE: Record<
  BookingStatusTone,
  { border: string; background: string; color: string }
> = {
  green: {
    border: "1px solid rgba(74,103,65,0.35)",
    background: "rgba(74,103,65,0.08)",
    color: "rgb(74,103,65)",
  },
  red: {
    border: "1px solid rgba(140,55,45,0.35)",
    background: "rgba(140,55,45,0.07)",
    color: "rgb(140,55,45)",
  },
  amber: {
    border: "1px solid rgba(184,115,51,0.4)",
    background: "rgba(184,115,51,0.07)",
    color: "hsl(var(--nl-russet))",
  },
  neutral: {
    border: "1px solid rgba(44,24,16,0.2)",
    background: "rgba(44,24,16,0.03)",
    color: "hsl(var(--nl-russet))",
  },
};
