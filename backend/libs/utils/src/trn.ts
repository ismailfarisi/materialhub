/**
 * UAE Tax Registration Number (TRN) helpers.
 *
 * A TRN is 15 digits, issued by the Federal Tax Authority. The FTA publishes
 * no check-digit algorithm, so this is a format check only: it cannot tell a
 * real TRN from a well-formed made-up one. Admins still verify the TRN against
 * the VAT certificate (or the FTA's TRN verification service) before marking
 * a business or vendor verified.
 *
 * Under the UAE e-invoicing data dictionary the Tax Identification Number
 * (TIN) is the first 10 digits of the TRN and is the basis of the Peppol
 * participant identifier. UNVERIFIED: the "0235" scheme and "<TIN>" value
 * format below follow the published UAE e-invoicing guidance as we read it;
 * confirm with the chosen Accredited Service Provider before go-live.
 */

export const TRN_LENGTH = 15;
export const TIN_LENGTH = 10;
/** Peppol EAS / ICD code used for UAE TIN-based endpoints. UNVERIFIED (see above). */
export const UAE_PEPPOL_SCHEME = "0235";

/** Strip spaces, dashes and dots people paste from certificates. */
export function normalizeTrn(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const cleaned = String(input).replace(/[\s.\-]/g, "");
  return cleaned.length === 0 ? null : cleaned;
}

export function isValidTrn(input: string | null | undefined): boolean {
  const trn = normalizeTrn(input);
  return trn !== null && /^[0-9]{15}$/.test(trn);
}

export type TrnCheck =
  | { ok: true; trn: string }
  | { ok: false; reason: "empty" | "not_digits" | "wrong_length" };

export function checkTrn(input: string | null | undefined): TrnCheck {
  const trn = normalizeTrn(input);
  if (trn === null) return { ok: false, reason: "empty" };
  if (!/^[0-9]+$/.test(trn)) return { ok: false, reason: "not_digits" };
  if (trn.length !== TRN_LENGTH) return { ok: false, reason: "wrong_length" };
  return { ok: true, trn };
}

/** First 10 digits of a valid TRN, or null. */
export function tinFromTrn(input: string | null | undefined): string | null {
  const c = checkTrn(input);
  return c.ok ? c.trn.slice(0, TIN_LENGTH) : null;
}

/** "0235:<TIN>" for a valid TRN, or null. */
export function peppolIdFromTrn(input: string | null | undefined): string | null {
  const tin = tinFromTrn(input);
  return tin ? `${UAE_PEPPOL_SCHEME}:${tin}` : null;
}
