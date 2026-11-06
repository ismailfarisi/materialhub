/**
 * UAE Tax Registration Number (FTA): exactly 15 digits. The first 10 digits
 * are the TIN, which the Peppol participant ID is derived from (`0235:<TIN>`).
 */

export const TRN_LENGTH = 15;

/** Strip the spaces and dashes people paste from a VAT certificate; keep digits only. */
export function normalizeTrn(value: string | null | undefined): string {
	if (!value) return "";
	// Arabic-Indic and Eastern Arabic-Indic digits typed on an Arabic keyboard.
	const western = value
		.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
		.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
	return western.replace(/\D/g, "");
}

export function isValidTrn(value: string | null | undefined): boolean {
	return /^\d{15}$/.test(normalizeTrn(value));
}

export type TrnState = "empty" | "short" | "long" | "valid";

/** Live state for the TRN field: how far along the 15 digits the buyer is. */
export function trnState(value: string | null | undefined): {
	state: TrnState;
	digits: number;
} {
	const digits = normalizeTrn(value).length;
	if (digits === 0) return { state: "empty", digits };
	if (digits < TRN_LENGTH) return { state: "short", digits };
	if (digits > TRN_LENGTH) return { state: "long", digits };
	return { state: "valid", digits };
}

/** Peppol participant ID as the backend derives it; null without a valid TRN. */
export function peppolIdFromTrn(trn: string | null | undefined): string | null {
	const digits = normalizeTrn(trn);
	if (!/^\d{15}$/.test(digits)) return null;
	return `0235:${digits.slice(0, 10)}`;
}
