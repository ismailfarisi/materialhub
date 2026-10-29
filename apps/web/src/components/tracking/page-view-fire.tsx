"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useChannelEvents } from "@/lib/channels/use-channel-events";

/**
 * Fires a PageView channel event on mount and on every pathname change.
 * The hook is consent-gated internally, so on a non-consented session this
 * is a no-op. PageView gets a fresh `event_id` per fire (Purchase is the
 * only event that caches by dedup key — see use-channel-events.ts).
 */
export function PageViewFire() {
  const pathname = usePathname();
  const { fire } = useChannelEvents();

  useEffect(() => {
    fire("PageView");
  }, [pathname, fire]);

  return null;
}
