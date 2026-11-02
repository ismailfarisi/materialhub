"use client";

import { useTranslations } from "next-intl";
import { MAISON_SANS } from "@/components/checkout/maison-primitives";

const statuses = ["placed", "shipped", "out_for_delivery", "delivered"] as const;

// The backend carries ~16 raw order/vendor-order statuses; the storefront
// timeline only shows four milestones. Map every customer-visible raw status
// onto its milestone so intermediate states (processing, out_for_delivery,
// partially_*) light up the right step instead of collapsing to -1 (which
// blanked the whole timeline). Unknown/pre-payment statuses stay at -1.
const STATUS_STEP: Record<string, number> = {
  placed: 0,
  pending_payment: 0,
  confirmed: 0,
  processing: 0,
  ready_to_ship: 0,
  shipped: 1,
  partially_shipped: 1,
  out_for_delivery: 2,
  delivered: 3,
  partially_delivered: 3,
};

// Statuses that end the order rather than advance it. A progress bar is the
// wrong shape for these: with no step to light up they render as four grey
// milestones, which reads as "nothing has happened yet" — the opposite of the
// truth. This is rendered per vendor sub-order, and vendor_orders.status is the
// full OrderStatus enum (order-status.service sets `cancelled` on the vendor
// order directly), so one vendor can cancel while the parent order stays live.
// In that case the summary panel's parent-order status still reads
// "Processing", and this row is the only thing that can say otherwise.
const TERMINAL_STATUS: Record<string, string> = {
  cancelled: "cancelled",
  refunded: "refunded",
  partially_refunded: "refunded",
  returned: "returned",
};

export function OrderTimeline({ currentStatus }: { currentStatus: string }) {
  const t = useTranslations("account.orderStatus");
  const normalized = currentStatus.toLowerCase();
  const terminal = TERMINAL_STATUS[normalized];
  const currentIndex = STATUS_STEP[normalized] ?? -1;

  if (terminal) {
    return (
      <div
        className="inline-flex items-center gap-1.5 uppercase leading-none"
        style={{
          fontFamily: MAISON_SANS,
          fontSize: 9.5,
          letterSpacing: "0.14em",
          color: "hsl(var(--nl-russet))",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            background: "currentColor",
            borderRadius: "50%",
          }}
        />
        {t(terminal)}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto max-w-full">
      {statuses.map((status, i) => {
        const reached = i <= currentIndex;
        return (
          <div key={status} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className="flex items-center justify-center h-6 w-6"
                style={{
                  border: `1px solid ${reached ? "hsl(var(--nl-amber))" : "rgba(15,18,24,0.3)"}`,
                  background: reached ? "hsl(var(--nl-amber))" : "transparent",
                  color: reached
                    ? "hsl(var(--nl-espresso))"
                    : "hsl(var(--nl-russet))",
                }}
              >
                {i < currentIndex ? (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <title>Completed</title>
                    <path d="M2 6.5 L5 9 L10 3" />
                  </svg>
                ) : (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      background: "currentColor",
                      opacity: i === currentIndex ? 1 : 0.5,
                    }}
                  />
                )}
              </div>
              <span
                className="uppercase leading-none"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 9.5,
                  letterSpacing: "0.14em",
                  color: reached
                    ? "hsl(var(--nl-cacao))"
                    : "hsl(var(--nl-russet))",
                }}
              >
                {t(status)}
              </span>
            </div>
            {i < statuses.length - 1 && (
              <div
                className="w-4 sm:w-6 mx-0.5 sm:mx-1 mb-4"
                style={{
                  height: 1,
                  background:
                    i < currentIndex
                      ? "hsl(var(--nl-amber))"
                      : "rgba(15,18,24,0.18)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
