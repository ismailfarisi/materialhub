import type { ServiceOffering } from "./types";

/**
 * Deposit amount (fils) for a `deposit` payment_mode offering. Mirrors the
 * booking-service's own snapshot math (see phase7-recon-api.md §2) — the
 * PDP's TermsBlock and Task 2's checkout both need this exact figure, so
 * it lives here once instead of being recomputed inline in two places.
 */
export function computeDepositFils(
  offering: Pick<ServiceOffering, "deposit_type" | "deposit_value" | "price_fils">,
): number {
  if (offering.deposit_type === "fixed") {
    return offering.deposit_value;
  }
  if (offering.deposit_type === "percent") {
    return Math.round((offering.price_fils * offering.deposit_value) / 100);
  }
  return offering.price_fils;
}
