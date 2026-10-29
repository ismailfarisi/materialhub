"use client";

import { captureAffiliateRef } from "@/lib/channels/affiliate";
import { captureGclidFromLocation } from "@/lib/channels/gclid";
import { useEffect } from "react";

/**
 * One-shot side effect: capture `?gclid=` / `?gbraid=` / `?wbraid=` from the
 * current URL into sessionStorage on first mount. Subsequent navigations are
 * handled by re-mount only when the locale segment changes — but the storage
 * persists for 90 days so a single capture per session is enough.
 *
 * Also captures `?aff=CODE` affiliate refs (see `lib/channels/affiliate.ts`)
 * on the same first mount — non-blocking, best-effort.
 */
export function GclidCapture() {
  useEffect(() => {
    captureGclidFromLocation();
    void captureAffiliateRef();
  }, []);
  return null;
}
