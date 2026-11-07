/** "sales-channels" / "shipping_rates" → "Sales channels" / "Shipping rates". */
export function entityTypeLabel(value: string): string {
  const words = value.replace(/[-_]+/g, " ").trim();
  if (!words) return value;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
