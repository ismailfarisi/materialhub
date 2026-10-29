"use client";

import { captureGclidFromLocation } from "@/lib/channels/gclid";
import { useEffect } from "react";

/**
 * One-shot side effect: capture `?gclid=` / `?gbraid=` / `?wbraid=` from the
 * current URL into sessionStorage on first mount. Subsequent navigations are
 * handled by re-mount only when the locale segment changes — but the storage
 * persists for 90 days so a single capture per session is enough.
 */
export function GclidCapture() {
  useEffect(() => {
    captureGclidFromLocation();
  }, []);
  return null;
}
