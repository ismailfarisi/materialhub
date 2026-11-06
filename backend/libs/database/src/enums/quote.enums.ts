// Request for quotation (RFQ, roadmap item 3).
//
// Statuses are stored as varchar with CHECK constraints (see the
// QuoteRequests migration) rather than Postgres enums, so later states can be
// added without an ALTER TYPE.

/** Lifecycle of the buyer's request as a whole. */
export enum QuoteRequestStatus {
  /** Sent; no supplier has quoted yet. */
  open = "open",
  /** At least one supplier has a live response. */
  quoted = "quoted",
  /** The buyer accepted one supplier's response; it is in their cart. */
  accepted = "accepted",
  /** The buyer withdrew the request. */
  cancelled = "cancelled",
  /** Every supplier declined, so nothing can be accepted. */
  closed = "closed",
}

/** One supplier's side of a request (the request-vendor pair). */
export enum QuoteVendorStatus {
  /** Waiting for the supplier to quote. */
  pending = "pending",
  /** The supplier has a live response. */
  responded = "responded",
  /** The supplier said they can't quote. */
  vendor_declined = "vendor_declined",
  /** The buyer declined this supplier's response (the supplier may re-quote). */
  buyer_declined = "buyer_declined",
  /** The buyer accepted this supplier's response. */
  accepted = "accepted",
  /** The buyer accepted another supplier's response. */
  not_selected = "not_selected",
  /** The buyer cancelled the whole request. */
  cancelled = "cancelled",
}

/** A single priced response. A revision supersedes the previous one. */
export enum QuoteResponseStatus {
  submitted = "submitted",
  superseded = "superseded",
  accepted = "accepted",
  declined = "declined",
}

/** Units a buyer can ask for. Mirrors the trade units of measure on variants. */
export const QUOTE_UNITS = ["sheet", "roll", "metre", "pack", "carton", "piece", "kg"] as const;
export type QuoteUnit = (typeof QUOTE_UNITS)[number];

/** The seven emirates, stored the way addresses and delivery zones store them. */
export const QUOTE_EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
] as const;
export type QuoteEmirate = (typeof QUOTE_EMIRATES)[number];

/** A buyer can send one request to at most this many suppliers. */
export const MAX_QUOTE_VENDORS = 3;

export type QuoteActorRole = "buyer" | "vendor" | "admin" | "system";
