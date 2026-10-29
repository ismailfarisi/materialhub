import type { DepositType } from "@/lib/queries/offerings";

/**
 * Deposit unit boundary.
 *
 * `service_offerings.deposit_value` is interpreted by the backend as FILS for
 * `deposit_type === "fixed"` (booking.service.ts: `depositFils =
 * offering.deposit_value`), but the form labels the field "Deposit (AED)" —
 * so the value MUST be scaled ×100 on submit and ÷100 on load, exactly like
 * `price_aed` ↔ `price_fils`.
 *
 * `deposit_type === "percent"` stores a literal percentage (the backend does
 * `priceFils * (deposit_value / 100)`) and must NEVER be scaled.
 */
export function depositValueToPayloadUnits(
	depositType: DepositType,
	formValue: number,
): number {
	if (depositType === "fixed") return Math.round(formValue * 100);
	// percent (and the inert "none") are already in their storage unit.
	return Math.round(formValue);
}

export function depositValueToFormUnits(
	depositType: DepositType,
	storedValue: number,
): number {
	if (depositType === "fixed") return storedValue / 100;
	return storedValue;
}
