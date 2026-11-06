/**
 * UAE Tax Registration Number helpers. A TRN is 15 digits; this checks the
 * format only (the Federal Tax Authority is the authority on whether it is real).
 */

/** Strip the spaces and dashes people paste from a tax certificate. */
export function normalizeTrn(input: string): string {
	return input.replace(/[\s-]/g, "");
}

/** Empty means "no TRN" (null). Otherwise returns the 15 digits or an error. */
export function validateTrn(
	input: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
	const v = normalizeTrn(input.trim());
	if (v === "") return { ok: true, value: null };
	if (!/^\d+$/.test(v)) return { ok: false, error: "A TRN has digits only." };
	if (v.length !== 15) {
		return { ok: false, error: `A TRN has 15 digits; this has ${v.length}.` };
	}
	return { ok: true, value: v };
}

export type TrnState = "missing" | "invalid" | "unverified" | "verified";

/** What the vendor should see about their TRN right now. */
export function trnState(profile: {
	trn?: string | null;
	trn_verified_at?: string | null;
	trn_format_valid?: boolean;
}): TrnState {
	if (!profile.trn) return "missing";
	const formatValid = profile.trn_format_valid ?? validateTrn(profile.trn).ok;
	if (!formatValid) return "invalid";
	return profile.trn_verified_at ? "verified" : "unverified";
}
