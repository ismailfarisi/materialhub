export function filsToAed(fils: number): string {
  return (fils / 100).toFixed(2);
}

export function formatAed(fils: number): string {
  return `${filsToAed(fils)} AED`;
}

/**
 * Parse an AED string input (e.g. "12.34") into integer fils.
 * Returns null if the input is empty or invalid.
 */
export function parseAedInput(aedInput: string): number | null {
  if (!aedInput.trim()) return null;
  const n = Number(aedInput);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * "AED 12,345.00" — grouped, 2 decimals, for finance tables and tiles where
 * five- and six-figure amounts need to be read at a glance.
 */
export function formatAedGrouped(fils: number | null | undefined): string {
  if (fils == null) return "—";
  const sign = fils < 0 ? "−" : "";
  const aed = (Math.abs(fils) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}AED ${aed}`;
}
