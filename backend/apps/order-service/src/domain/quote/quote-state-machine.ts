/**
 * Request for quotation: the state machine and the acceptance rules.
 *
 * Pure functions only, so every rule is unit-tested without a database.
 * QuoteRequestService applies them inside a transaction with the rows locked.
 *
 * Three things carry a status:
 *  - the request as a whole (QuoteRequestStatus), derived from its suppliers;
 *  - each supplier's side (QuoteVendorStatus), moved by explicit actions;
 *  - each priced response (QuoteResponseStatus).
 */
import {
  MAX_QUOTE_VENDORS,
  QuoteRequestStatus,
  QuoteResponseStatus,
  QuoteVendorStatus,
} from "@materialhub/database/src/enums/quote.enums.ts";

export { MAX_QUOTE_VENDORS };

/** Thrown when an action isn't allowed in the current state. Maps to HTTP 409/422. */
export class QuoteRuleError extends Error {
  constructor(
    public readonly code: QuoteRuleCode,
    message: string,
  ) {
    super(message);
    this.name = "QuoteRuleError";
  }
}

export type QuoteRuleCode =
  | "INVALID_TRANSITION"
  | "REQUEST_CLOSED"
  | "NO_LIVE_RESPONSE"
  | "QUOTE_EXPIRED"
  | "ALREADY_ACCEPTED"
  | "TOO_MANY_VENDORS"
  | "NO_VENDORS"
  | "INVALID_INPUT";

// ── Supplier-side transitions ────────────────────────────────────────────

export type VendorAction =
  | "respond" // supplier submits or revises a priced response
  | "vendor_decline" // supplier says they can't quote
  | "buyer_decline" // buyer turns down this supplier's response
  | "accept" // buyer accepts this supplier's response
  | "not_selected" // buyer accepted someone else
  | "cancel"; // buyer cancels the whole request

const V = QuoteVendorStatus;

const VENDOR_TRANSITIONS: Record<
  QuoteVendorStatus,
  Partial<Record<VendorAction, QuoteVendorStatus>>
> = {
  [V.pending]: {
    respond: V.responded,
    vendor_decline: V.vendor_declined,
    not_selected: V.not_selected,
    cancel: V.cancelled,
  },
  [V.responded]: {
    respond: V.responded,
    vendor_decline: V.vendor_declined,
    buyer_decline: V.buyer_declined,
    accept: V.accepted,
    not_selected: V.not_selected,
    cancel: V.cancelled,
  },
  // A declined response can be revised: the buyer said "too dear", the
  // supplier sharpens the price.
  [V.buyer_declined]: {
    respond: V.responded,
    vendor_decline: V.vendor_declined,
    not_selected: V.not_selected,
    cancel: V.cancelled,
  },
  [V.vendor_declined]: {},
  [V.accepted]: {},
  [V.not_selected]: {},
  [V.cancelled]: {},
};

export function nextVendorStatus(
  current: QuoteVendorStatus,
  action: VendorAction,
): QuoteVendorStatus {
  const next = VENDOR_TRANSITIONS[current]?.[action];
  if (!next) {
    throw new QuoteRuleError(
      "INVALID_TRANSITION",
      `Can't ${action.replace("_", " ")} a quote that is ${current.replace("_", " ")}`,
    );
  }
  return next;
}

export function canVendor(current: QuoteVendorStatus, action: VendorAction): boolean {
  return VENDOR_TRANSITIONS[current]?.[action] !== undefined;
}

export function isTerminalVendorStatus(status: QuoteVendorStatus): boolean {
  return Object.keys(VENDOR_TRANSITIONS[status] ?? {}).length === 0;
}

// ── Request status (derived) ─────────────────────────────────────────────

const REQUEST_TERMINAL = new Set<QuoteRequestStatus>([
  QuoteRequestStatus.accepted,
  QuoteRequestStatus.cancelled,
  QuoteRequestStatus.closed,
]);

export function isRequestOpen(status: QuoteRequestStatus): boolean {
  return !REQUEST_TERMINAL.has(status);
}

/**
 * The request's status follows from its suppliers' statuses:
 *  - any accepted → accepted
 *  - all cancelled → cancelled
 *  - any responded → quoted
 *  - every supplier declined (by them) → closed: nothing left to accept
 *  - otherwise → open (waiting, or a buyer-declined quote can still be revised)
 */
export function deriveRequestStatus(vendorStatuses: QuoteVendorStatus[]): QuoteRequestStatus {
  if (vendorStatuses.length === 0) return QuoteRequestStatus.open;
  if (vendorStatuses.includes(V.accepted)) return QuoteRequestStatus.accepted;
  if (vendorStatuses.every((s) => s === V.cancelled)) return QuoteRequestStatus.cancelled;
  if (vendorStatuses.includes(V.responded)) return QuoteRequestStatus.quoted;
  if (vendorStatuses.every((s) => s === V.vendor_declined || s === V.not_selected)) {
    return QuoteRequestStatus.closed;
  }
  return QuoteRequestStatus.open;
}

// ── Dates (Asia/Dubai calendar) ──────────────────────────────────────────

/** Today's calendar date in Asia/Dubai (UTC+4, no DST) as YYYY-MM-DD. */
export function dubaiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A quote is valid through the end of its valid_until day in Dubai. */
export function isQuoteExpired(validUntil: string, now: Date = new Date()): boolean {
  return validUntil < dubaiToday(now);
}

/** Calendar-date shape check for YYYY-MM-DD input. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// ── Request creation rules ───────────────────────────────────────────────

/** Dedupe the targeted suppliers and enforce 1..MAX_QUOTE_VENDORS. */
export function normaliseVendorIds(ids: string[]): string[] {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    throw new QuoteRuleError("NO_VENDORS", "Choose at least one supplier");
  }
  if (unique.length > MAX_QUOTE_VENDORS) {
    throw new QuoteRuleError(
      "TOO_MANY_VENDORS",
      `A request can go to at most ${MAX_QUOTE_VENDORS} suppliers`,
    );
  }
  return unique;
}

export function assertNeedByDate(needBy: string | null | undefined, now: Date = new Date()): void {
  if (needBy == null || needBy === "") return;
  if (!isIsoDate(needBy)) {
    throw new QuoteRuleError("INVALID_INPUT", "Need-by date must be a calendar date (YYYY-MM-DD)");
  }
  if (needBy < dubaiToday(now)) {
    throw new QuoteRuleError("INVALID_INPUT", "Need-by date can't be in the past");
  }
}

// ── Response rules ───────────────────────────────────────────────────────

export interface ResponseInput {
  unit_price: number;
  moq: number;
  lead_time_days: number;
  valid_until: string;
}

export function assertResponseInput(input: ResponseInput, now: Date = new Date()): void {
  if (!Number.isInteger(input.unit_price) || input.unit_price <= 0) {
    throw new QuoteRuleError("INVALID_INPUT", "Unit price must be a positive whole number of fils");
  }
  if (!Number.isInteger(input.moq) || input.moq <= 0) {
    throw new QuoteRuleError("INVALID_INPUT", "Minimum order must be at least 1");
  }
  if (!Number.isInteger(input.lead_time_days) || input.lead_time_days < 0) {
    throw new QuoteRuleError("INVALID_INPUT", "Lead time must be zero or more days");
  }
  if (!isIsoDate(input.valid_until)) {
    throw new QuoteRuleError("INVALID_INPUT", "Valid-until must be a calendar date (YYYY-MM-DD)");
  }
  if (isQuoteExpired(input.valid_until, now)) {
    throw new QuoteRuleError("INVALID_INPUT", "Valid-until can't be in the past");
  }
}

// ── Acceptance rules ─────────────────────────────────────────────────────

export interface AcceptanceContext {
  requestStatus: QuoteRequestStatus;
  vendorStatus: QuoteVendorStatus;
  /** The supplier's live response, or null if they haven't quoted. */
  response: {
    id: string;
    status: QuoteResponseStatus;
    valid_until: string;
    moq: number;
  } | null;
  /** The id this supplier side points at as current. */
  currentResponseId: string | null;
  requestedQuantity: number;
}

/**
 * Throws a QuoteRuleError unless the buyer may accept this response now.
 * Returns the cart quantity: the requested quantity, raised to the MOQ.
 */
export function assertAcceptable(
  ctx: AcceptanceContext,
  now: Date = new Date(),
): { quantity: number } {
  if (ctx.requestStatus === QuoteRequestStatus.accepted || ctx.vendorStatus === V.accepted) {
    throw new QuoteRuleError("ALREADY_ACCEPTED", "This request already has an accepted quote");
  }
  if (!isRequestOpen(ctx.requestStatus)) {
    throw new QuoteRuleError("REQUEST_CLOSED", `This request is ${ctx.requestStatus}`);
  }
  if (
    !ctx.response ||
    ctx.response.id !== ctx.currentResponseId ||
    ctx.response.status !== QuoteResponseStatus.submitted
  ) {
    throw new QuoteRuleError("NO_LIVE_RESPONSE", "This supplier has no live quote to accept");
  }
  if (!canVendor(ctx.vendorStatus, "accept")) {
    throw new QuoteRuleError(
      "INVALID_TRANSITION",
      `Can't accept a quote that is ${ctx.vendorStatus.replace("_", " ")}`,
    );
  }
  if (isQuoteExpired(ctx.response.valid_until, now)) {
    throw new QuoteRuleError(
      "QUOTE_EXPIRED",
      "This quote has expired; ask the supplier to re-quote",
    );
  }
  return { quantity: Math.max(ctx.requestedQuantity, ctx.response.moq) };
}

/** Whether a response can still be accepted, for list and comparison views. */
export function responseDisplayState(
  response: { status: QuoteResponseStatus; valid_until: string },
  now: Date = new Date(),
): "live" | "expired" | "accepted" | "declined" | "superseded" {
  if (response.status === QuoteResponseStatus.accepted) return "accepted";
  if (response.status === QuoteResponseStatus.declined) return "declined";
  if (response.status === QuoteResponseStatus.superseded) return "superseded";
  return isQuoteExpired(response.valid_until, now) ? "expired" : "live";
}

/** Who may post in a thread: anyone but a cancelled side or request. */
export function canMessage(
  requestStatus: QuoteRequestStatus,
  vendorStatus: QuoteVendorStatus,
): boolean {
  return requestStatus !== QuoteRequestStatus.cancelled && vendorStatus !== V.cancelled;
}

/** Request number, e.g. RFQ-2026-000042. */
export function formatRequestNumber(year: number, sequence: number): string {
  return `RFQ-${year}-${String(sequence).padStart(6, "0")}`;
}
