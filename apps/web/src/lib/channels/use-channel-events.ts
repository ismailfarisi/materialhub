"use client";

import { useCallback } from "react";
import { hasConsent, useConsent } from "@/lib/consent/consent-state";
import { getOrCreateEventId } from "./event-id-store";
import { readAllClickIds } from "./gclid";
import { getRegisteredChannels } from "./registry";
import type { BrowserEvent, EventPayload } from "./types";

/**
 * The single public surface for firing browser-side analytics events. The hook:
 *
 *  - No-ops when consent is anything other than `"accepted"` (so callers can
 *    safely fire from `useEffect`s without guarding consent themselves).
 *  - Generates a stable `event_id` via `getOrCreateEventId(event, dedupKey)`.
 *    `dedupKey` is `payload.order_id` for `Purchase`, undefined otherwise — so
 *    a page refresh on the order-confirmation page re-fires the SAME id and
 *    Google dedupes against the server-side Enhanced Conversions Adjustment.
 *  - Enriches the payload with `gclid` (from sessionStorage) and
 *    `transaction_id` (= `payload.order_id`) for Purchase.
 *  - Fans out to every registered channel with try/catch isolation per
 *    channel: one channel throwing must not block the others.
 */
export function useChannelEvents() {
  const { decision } = useConsent();
  const consented = hasConsent(decision);

  const fire = useCallback(
    (
      event: BrowserEvent,
      payload: Omit<EventPayload, "event_id" | "gclid"> = {} as Omit<
        EventPayload,
        "event_id" | "gclid"
      >,
    ) => {
      if (!consented) return;

      // Only Purchase uses the per-order dedup store — a page refresh on the
      // order-confirmation page re-fires the SAME event_id so the server-side
      // Enhanced Conversions Adjustment dedupes against it. Activity events
      // (PageView/ViewContent/AddToCart/InitiateCheckout) get a fresh UUID per
      // fire so SPA navigation tracking works correctly (caching PageView by
      // event-name only would return the same id for the entire 7-day session).
      const event_id =
        event === "Purchase"
          ? getOrCreateEventId(event, payload.order_id ?? undefined)
          : crypto.randomUUID();

      const enriched: EventPayload = {
        ...payload,
        event_id,
        gclid: readAllClickIds().gclid ?? null,
        transaction_id:
          event === "Purchase"
            ? (payload.order_id ?? payload.transaction_id)
            : undefined,
      };

      for (const c of getRegisteredChannels()) {
        try {
          c.fire(event, enriched);
        } catch (err) {
          // biome-ignore lint/suspicious/noConsole: channel fire failure
          console.error(`[channels] ${c.id} fire failed`, event, err);
        }
      }
    },
    [consented],
  );

  return { fire };
}
