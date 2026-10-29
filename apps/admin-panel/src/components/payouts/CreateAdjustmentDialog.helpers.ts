import { parseAedInput } from "@/lib/money";

export type AdjustmentDirection = "credit" | "clawback";

/**
 * The one AED -> signed-fils boundary crossing for manual payout
 * adjustments. `direction` alone decides the sign — never anything parsed
 * from the amount string — since the amount field only ever accepts a
 * positive magnitude; a stray "-" must never silently flip a credit into
 * a clawback or vice versa.
 *
 * Returns null when the amount is missing, unparsable, negative, or zero
 * (the API rejects zero-amount adjustments), or when no direction has been
 * chosen yet.
 */
export function toSignedAdjustmentFils(
	amountAed: string,
	direction: AdjustmentDirection | null,
): number | null {
	const magnitudeFils = parseAedInput(amountAed);
	if (magnitudeFils == null || magnitudeFils <= 0 || direction == null) {
		return null;
	}
	return direction === "clawback" ? -magnitudeFils : magnitudeFils;
}
