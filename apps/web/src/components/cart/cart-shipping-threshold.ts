export const FREE_SHIPPING_THRESHOLD_FILS = 15000;

export function getFreeShippingProgress(subtotalFils: number) {
  const progress = Math.min(100, (subtotalFils / FREE_SHIPPING_THRESHOLD_FILS) * 100);
  const unlocked = subtotalFils >= FREE_SHIPPING_THRESHOLD_FILS;
  const remainingFils = Math.max(0, FREE_SHIPPING_THRESHOLD_FILS - subtotalFils);

  return { progress, unlocked, remainingFils };
}
