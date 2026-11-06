/**
 * Business accounts, approvals, tax invoices and net terms.
 * Mirrors docs/business/business-accounts.md (the API contract). Money is fils.
 */

export type BusinessRole = "admin" | "approver" | "buyer";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type NetTerms = "net_30" | "net_60";

export interface BillingAddress {
	line1: string;
	line2?: string;
	city: string;
	emirate: string;
	po_box?: string;
	country_code: "AE";
}

export interface BusinessInput {
	legal_name: string;
	trade_name?: string | null;
	trade_licence_number: string;
	trade_licence_issuer?: string | null;
	/** YYYY-MM-DD, must be in the future. */
	trade_licence_expiry: string;
	trade_licence_document_key?: string | null;
	vat_registered: boolean;
	/** Required when vat_registered; 15 digits. */
	trn?: string | null;
	billing_address: BillingAddress;
}

export interface BusinessAccount extends BusinessInput {
	id: string;
	has_licence_document: boolean;
	peppol_participant_id: string | null;
	verification_status: VerificationStatus;
	rejection_reason: string | null;
	verified_at: string | null;
	approval_threshold_fils: number | null;
	created_at: string;
}

export interface Membership {
	id: string;
	role: BusinessRole;
	status: "active";
}

export interface Member {
	id: string;
	user_id: string | null;
	email: string;
	name: string | null;
	role: BusinessRole;
	status: "invited" | "active";
	invited_at: string;
	joined_at: string | null;
}

export interface Invite {
	id: string;
	business_account_id: string;
	legal_name: string;
	role: BusinessRole;
	invited_at: string;
}

export type CreditStatus = "applied" | "approved" | "rejected" | "suspended";

export interface CreditAccount {
	status: CreditStatus;
	terms: NetTerms;
	requested_limit_fils: number | null;
	credit_limit_fils: number;
	outstanding_fils: number;
	available_fils: number;
	overdue_count: number;
	overdue_fils: number;
	applied_at: string;
	decided_at: string | null;
	decision_note: string | null;
}

export interface BusinessMe {
	account: BusinessAccount | null;
	membership: Membership | null;
	credit: CreditAccount | null;
	invites: Invite[];
}

export type ApprovalStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "used"
	| "expired"
	| "cancelled";

export interface ApprovalPerson {
	id: string;
	name: string | null;
	email: string;
}

export interface Approval {
	id: string;
	status: ApprovalStatus;
	amount_fils: number;
	currency: "AED";
	item_count: number;
	items: {
		product_name: string;
		variant_name: string | null;
		vendor_name: string | null;
		quantity: number;
		unit_price_fils: number;
		line_total_fils: number;
	}[];
	note: string | null;
	requested_by: ApprovalPerson;
	decided_by: ApprovalPerson | null;
	decision_note: string | null;
	created_at: string;
	decided_at: string | null;
	expires_at: string | null;
	order_id: string | null;
	order_number: string | null;
	can_decide: boolean;
}

export interface InvoiceRow {
	id: string;
	invoice_number: string;
	kind: "vendor" | "platform";
	order_id: string;
	order_number: string;
	seller_name: string;
	seller_trn: string | null;
	buyer_name: string | null;
	buyer_trn: string | null;
	issue_date: string;
	due_date: string | null;
	payment_terms: "immediate" | NetTerms;
	payment_status: "paid" | "unpaid" | "void";
	is_overdue: boolean;
	taxable_fils: number;
	vat_fils: number;
	total_fils: number;
	currency: "AED";
	einvoice_status:
		| "not_applicable"
		| "ready"
		| "submitted"
		| "accepted"
		| "rejected";
}

export interface Paged<T> {
	items: T[];
	total: number;
	page: number;
	limit: number;
}

/** The optional `business` block on GET /checkout/quote. */
export interface CheckoutQuoteBusiness {
	legal_name: string;
	trn: string | null;
	billing_address: BillingAddress;
	role: BusinessRole;
	approval_threshold_fils: number | null;
	approval_required: boolean;
	approval: { id: string; status: ApprovalStatus } | null;
	/** Not in the contract yet; read when the backend sends it. */
	terms?: NetTerms | null;
}
