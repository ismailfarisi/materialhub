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
