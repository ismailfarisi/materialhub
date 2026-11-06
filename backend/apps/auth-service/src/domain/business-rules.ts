// Pure rules for business accounts: input validation, role permissions and
// response shaping. No I/O, so it is unit-tested directly.
import { HttpError } from "@materialhub/plugins";
import {
  type NetTerms,
  availableCreditFils,
  checkTrn,
  isNetTerms,
  peppolIdFromTrn,
} from "@materialhub/utils";

export type BusinessRole = "admin" | "approver" | "buyer";

export const BUSINESS_ROLES: readonly BusinessRole[] = ["admin", "approver", "buyer"];

export type BusinessAction =
  | "edit_profile"
  | "manage_members"
  | "apply_net_terms"
  | "decide_approvals"
  | "view_all_invoices"
  | "view_all_approvals";

const PERMISSIONS: Record<BusinessRole, readonly BusinessAction[]> = {
  admin: [
    "edit_profile",
    "manage_members",
    "apply_net_terms",
    "decide_approvals",
    "view_all_invoices",
    "view_all_approvals",
  ],
  approver: ["decide_approvals", "view_all_invoices", "view_all_approvals"],
  buyer: [],
};

export function canBusiness(role: string | null | undefined, action: BusinessAction): boolean {
  if (!role || !(role in PERMISSIONS)) return false;
  return PERMISSIONS[role as BusinessRole].includes(action);
}

export function assertBusinessRole(role: string | null | undefined, action: BusinessAction): void {
  if (!canBusiness(role, action)) {
    throw new HttpError(403, "Your role in this business can't do that", "BUSINESS_ROLE_REQUIRED");
  }
}

export function isBusinessRole(v: unknown): v is BusinessRole {
  return typeof v === "string" && (BUSINESS_ROLES as readonly string[]).includes(v);
}

export interface BusinessInput {
  legal_name?: string;
  trade_name?: string | null;
  trade_licence_number?: string;
  trade_licence_issuer?: string | null;
  trade_licence_expiry?: string;
  trade_licence_document_key?: string | null;
  vat_registered?: boolean;
  trn?: string | null;
  billing_address?: {
    line1?: string;
    line2?: string | null;
    city?: string;
    emirate?: string;
    po_box?: string | null;
    country_code?: string;
  };
  approval_threshold_fils?: number | null;
}

export interface NormalizedBusinessInput {
  legal_name?: string;
  trade_name?: string | null;
  trade_licence_number?: string;
  trade_licence_issuer?: string | null;
  trade_licence_expiry?: string;
  trade_licence_document_key?: string | null;
  vat_registered?: boolean;
  trn?: string | null;
  peppol_participant_id?: string | null;
  billing_address?: {
    line1: string;
    line2: string | null;
    city: string;
    emirate: string;
    po_box: string | null;
    country_code: string;
  };
  approval_threshold_fils?: number | null;
}

function bad(message: string, code: string): never {
  throw new HttpError(400, message, code);
}

function text(v: unknown, field: string, max: number): string {
  if (typeof v !== "string" || v.trim().length === 0) bad(`${field} is required`, "FIELD_REQUIRED");
  const t = v.trim();
  if (t.length > max) bad(`${field} is too long`, "FIELD_TOO_LONG");
  return t;
}

function optText(v: unknown, field: string, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") bad(`${field} must be text`, "FIELD_INVALID");
  const t = v.trim();
  if (t.length === 0) return null;
  if (t.length > max) bad(`${field} is too long`, "FIELD_TOO_LONG");
  return t;
}

/** YYYY-MM-DD in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Validate and normalise a create (partial = false) or update (partial =
 * true) payload. `existing` is the current row on update, so cross-field rules
 * (VAT-registered needs a TRN) are checked against the merged result.
 */
export function normalizeBusinessInput(
  input: BusinessInput,
  opts: {
    partial: boolean;
    userId: string;
    today?: Date;
    existing?: { vat_registered: boolean; trn: string | null } | null;
  },
): NormalizedBusinessInput {
  const today = isoDate(opts.today ?? new Date());
  const out: NormalizedBusinessInput = {};
  const has = (k: keyof BusinessInput) => !opts.partial || input[k] !== undefined;

  if (has("legal_name")) out.legal_name = text(input.legal_name, "Legal name", 255);
  if (input.trade_name !== undefined) out.trade_name = optText(input.trade_name, "Trade name", 255);
  if (has("trade_licence_number"))
    out.trade_licence_number = text(input.trade_licence_number, "Trade licence number", 100);
  if (input.trade_licence_issuer !== undefined)
    out.trade_licence_issuer = optText(input.trade_licence_issuer, "Licence issuer", 100);

  if (has("trade_licence_expiry")) {
    const exp = text(input.trade_licence_expiry, "Licence expiry", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || Number.isNaN(Date.parse(`${exp}T00:00:00Z`))) {
      bad("Licence expiry must be a date (YYYY-MM-DD)", "FIELD_INVALID");
    }
    if (exp <= today) bad("The trade licence has expired", "LICENCE_EXPIRED");
    out.trade_licence_expiry = exp;
  }

  if (input.trade_licence_document_key !== undefined) {
    const key = optText(input.trade_licence_document_key, "Licence document", 1024);
    if (key !== null && !key.startsWith(`private/business/${opts.userId}/`)) {
      bad("Upload the licence document again", "LICENCE_KEY_INVALID");
    }
    out.trade_licence_document_key = key;
  }

  if (has("vat_registered")) {
    if (typeof input.vat_registered !== "boolean")
      bad("VAT registration is required", "FIELD_REQUIRED");
    out.vat_registered = input.vat_registered;
  }

  if (input.trn !== undefined || has("trn")) {
    if (input.trn === null || input.trn === undefined || String(input.trn).trim() === "") {
      out.trn = null;
    } else {
      const c = checkTrn(input.trn);
      if (!c.ok) bad("A TRN is 15 digits, as printed on your VAT certificate", "TRN_INVALID");
      out.trn = c.trn;
    }
    out.peppol_participant_id = peppolIdFromTrn(out.trn);
  }

  const vatRegistered = out.vat_registered ?? opts.existing?.vat_registered ?? false;
  const trn = out.trn !== undefined ? out.trn : (opts.existing?.trn ?? null);
  if (vatRegistered && !trn) bad("Enter your TRN, or untick VAT registered", "TRN_REQUIRED");
  if (!vatRegistered && out.vat_registered === false) {
    // Not VAT-registered: never keep a stale TRN.
    out.trn = null;
    out.peppol_participant_id = null;
  }

  if (has("billing_address")) {
    const a = input.billing_address;
    if (!a || typeof a !== "object") bad("Billing address is required", "FIELD_REQUIRED");
    const country = (optText(a.country_code, "Country", 2) ?? "AE").toUpperCase();
    if (country !== "AE") bad("Business accounts are for UAE companies", "FIELD_INVALID");
    out.billing_address = {
      line1: text(a.line1, "Address line 1", 255),
      line2: optText(a.line2, "Address line 2", 255),
      city: text(a.city, "City", 100),
      emirate: text(a.emirate, "Emirate", 100),
      po_box: optText(a.po_box, "PO box", 20),
      country_code: country,
    };
  }

  if (input.approval_threshold_fils !== undefined) {
    const v = input.approval_threshold_fils;
    if (v === null) out.approval_threshold_fils = null;
    else if (!Number.isInteger(v) || v < 0)
      bad("Approval limit must be a whole amount", "FIELD_INVALID");
    else out.approval_threshold_fils = v;
  }

  return out;
}

/** Fields that, when changed, send the account back to `pending` review. */
export const VERIFICATION_FIELDS = [
  "legal_name",
  "trade_licence_number",
  "trade_licence_expiry",
  "trade_licence_document_key",
  "trn",
  "vat_registered",
] as const;

export function touchesVerification(
  changes: NormalizedBusinessInput,
  existing: Record<string, unknown>,
): boolean {
  return VERIFICATION_FIELDS.some(
    (f) => changes[f] !== undefined && (changes[f] ?? null) !== (existing[f] ?? null),
  );
}

export interface NetTermsApplication {
  terms: NetTerms;
  requested_limit_fils: number;
  note: string | null;
}

export function normalizeNetTermsApplication(input: {
  terms?: unknown;
  requested_limit_fils?: unknown;
  note?: unknown;
}): NetTermsApplication {
  if (!isNetTerms(input.terms)) bad("Choose net 30 or net 60", "FIELD_INVALID");
  const limit = input.requested_limit_fils;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) {
    bad("Enter the credit limit you need", "FIELD_INVALID");
  }
  return {
    terms: input.terms,
    requested_limit_fils: limit,
    note: optText(input.note, "Note", 1000),
  };
}

export interface CreditRow {
  status: string;
  terms: string;
  requested_limit_fils: number | null;
  credit_limit_fils: number;
  outstanding_fils: number;
  applied_at: Date;
  decided_at: Date | null;
  decision_note: string | null;
}

export function toCreditView(
  credit: CreditRow | null,
  overdue: { count: number; fils: number } = { count: 0, fils: 0 },
) {
  if (!credit) return null;
  return {
    status: credit.status,
    terms: credit.terms,
    requested_limit_fils: credit.requested_limit_fils,
    credit_limit_fils: credit.credit_limit_fils,
    outstanding_fils: credit.outstanding_fils,
    available_fils:
      credit.status === "approved"
        ? availableCreditFils(credit.credit_limit_fils, credit.outstanding_fils)
        : 0,
    overdue_count: overdue.count,
    overdue_fils: overdue.fils,
    applied_at: credit.applied_at,
    decided_at: credit.decided_at,
    decision_note: credit.decision_note,
  };
}

export function toAccountView(a: {
  id: string;
  legal_name: string;
  trade_name?: string | null;
  trade_licence_number: string;
  trade_licence_issuer?: string | null;
  trade_licence_expiry: string;
  trade_licence_document_key?: string | null;
  vat_registered: boolean;
  trn?: string | null;
  peppol_participant_id?: string | null;
  billing_address: unknown;
  verification_status: string;
  rejection_reason?: string | null;
  verified_at?: Date | null;
  approval_threshold_fils?: number | null;
  created_at: Date;
}) {
  return {
    id: a.id,
    legal_name: a.legal_name,
    trade_name: a.trade_name ?? null,
    trade_licence_number: a.trade_licence_number,
    trade_licence_issuer: a.trade_licence_issuer ?? null,
    trade_licence_expiry: a.trade_licence_expiry,
    has_licence_document: Boolean(a.trade_licence_document_key),
    vat_registered: a.vat_registered,
    trn: a.trn ?? null,
    peppol_participant_id: a.peppol_participant_id ?? null,
    billing_address: a.billing_address,
    verification_status: a.verification_status,
    rejection_reason: a.rejection_reason ?? null,
    verified_at: a.verified_at ?? null,
    approval_threshold_fils: a.approval_threshold_fils ?? null,
    created_at: a.created_at,
  };
}

export function displayName(u: { first_name?: string | null; last_name?: string | null } | null) {
  if (!u) return null;
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || null;
}
