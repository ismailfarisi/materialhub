// settlement-window.ts — pure resolution, no I/O.
export const DEFAULT_SETTLEMENT_WINDOW_DAYS = 7;

function valid(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/**
 * Vendor override → global site_setting → hard default. A vendor window of 0
 * is meaningful (pay on delivery) and must survive, so this tests validity
 * rather than truthiness.
 */
export function resolveWindowDays(
  vendorWindow: number | null | undefined,
  globalWindow: number | null | undefined,
): number {
  if (valid(vendorWindow)) return vendorWindow;
  if (valid(globalWindow)) return globalWindow;
  return DEFAULT_SETTLEMENT_WINDOW_DAYS;
}
