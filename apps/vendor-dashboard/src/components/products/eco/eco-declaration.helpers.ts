/**
 * Plastic-ban ready declaration (eco catalogue): pure helpers shared by the
 * panel and its tests. Mirrors product-service `eco-declaration.service.ts`.
 */

export type EcoDeclarationStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface EcoDeclaration {
	id: string;
	product_id: string;
	status: EcoDeclarationStatus;
	statement: string | null;
	certificate_filename: string | null;
	has_certificate: boolean;
	submitted_at: string;
	reviewed_at: string | null;
	rejection_reason: string | null;
}

export const MAX_STATEMENT_LENGTH = 2000;
export const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024;
export const CERTIFICATE_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const DECLARATION_TEXT =
	"I declare that, to my knowledge, this product is not a single-use plastic item covered by the UAE ban (cups, lids, cutlery, plates, straws, stirrers, foam food containers, or single-use bags under 50 microns).";

export const REVIEW_DISCLAIMER =
	"MaterialHub reviews declarations for the listing; it does not certify legal compliance.";

export const STATUS_META: Record<
	EcoDeclarationStatus,
	{ label: string; tone: "warning" | "success" | "error" | "neutral"; help: string }
> = {
	pending: {
		label: "Pending review",
		tone: "warning",
		help: "MaterialHub is reviewing this declaration. The storefront badge appears once it is approved.",
	},
	approved: {
		label: "Approved",
		tone: "success",
		help: "Buyers see a “Plastic-ban ready” badge stating that you declared it and MaterialHub reviewed it. Editing the declaration sends it back to review and hides the badge until then.",
	},
	rejected: {
		label: "Rejected",
		tone: "error",
		help: "Fix the points below and submit again.",
	},
	withdrawn: {
		label: "Withdrawn",
		tone: "neutral",
		help: "You withdrew this declaration. Submit it again to send it for review.",
	},
};

/** Returns an error message, or null when the file can be uploaded. */
export function validateCertificateFile(file: { type: string; size: number }): string | null {
	if (!(CERTIFICATE_TYPES as readonly string[]).includes(file.type)) {
		return "Upload a PDF, JPG or PNG file.";
	}
	if (file.size > MAX_CERTIFICATE_BYTES) {
		return "The certificate must be 10 MB or smaller.";
	}
	return null;
}

/**
 * The certificate in the draft: `keep` leaves the stored one untouched,
 * `remove` deletes it, `new` replaces it with a freshly uploaded key.
 */
export type CertificateDraft =
	| { kind: "keep" }
	| { kind: "remove" }
	| { kind: "new"; key: string; filename: string };

export interface DeclarationDraft {
	statement: string;
	confirm: boolean;
	certificate: CertificateDraft;
}

export function buildDeclarationPayload(draft: DeclarationDraft): {
	confirm: boolean;
	statement: string | null;
	certificate_key?: string | null;
	certificate_filename?: string | null;
} {
	const statement = draft.statement.trim();
	const payload: ReturnType<typeof buildDeclarationPayload> = {
		confirm: draft.confirm,
		statement: statement || null,
	};
	if (draft.certificate.kind === "remove") {
		payload.certificate_key = null;
		payload.certificate_filename = null;
	} else if (draft.certificate.kind === "new") {
		payload.certificate_key = draft.certificate.key;
		payload.certificate_filename = draft.certificate.filename;
	}
	return payload;
}

/** True when submitting would change an approved declaration (→ back to review). */
export function willResetApproval(
	current: EcoDeclaration | null | undefined,
	draft: DeclarationDraft,
): boolean {
	if (!current || current.status !== "approved") return false;
	if (draft.certificate.kind !== "keep") return true;
	return (draft.statement.trim() || null) !== (current.statement ?? null);
}

/** Server error → message for the vendor. */
export function declarationErrorMessage(error: unknown): string {
	const data = (error as { response?: { data?: { code?: string; message?: string; error?: string } } })
		?.response?.data;
	const code = data?.code ?? data?.error;
	switch (code) {
		case "ECO_DECLARATION_UNCONFIRMED":
			return "Tick the declaration to submit it.";
		case "ECO_CERTIFICATE_INVALID":
			return "Upload the certificate again; the previous upload could not be used.";
		case "ECO_STATEMENT_TOO_LONG":
			return `Keep the note under ${MAX_STATEMENT_LENGTH} characters.`;
		case "PRODUCT_NOT_FOUND":
			return "This product was not found for your store.";
		default:
			return data?.message ?? "Could not save the declaration. Try again.";
	}
}
