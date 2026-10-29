import { api } from "../api";

export type CreatorSummary = Record<
  string,
  { count: number; totalFils: number }
>;

export async function getCreatorSummary(): Promise<CreatorSummary> {
  const res = await api.get("/me/creator/summary");
  return res.data.data as CreatorSummary;
}

export interface CommissionListItem {
  id: string;
  creator_id: string;
  reel_id: string;
  order_id: string;
  order_item_id: string;
  gross_commission_fils: string;
  status: "pending" | "earned" | "voided" | "paid_out";
  eligible_at: string | null;
  earned_at: string | null;
  created_at: string;
}

export interface CommissionListResult {
  items: CommissionListItem[];
  nextCursor: string | null;
}

export async function getCreatorCommissions(
  status?: string,
  cursor?: string,
  limit?: number,
): Promise<CommissionListResult> {
  const res = await api.get("/me/creator/commissions", {
    params: { status, cursor, limit },
  });
  return {
    items: res.data.items,
    nextCursor: res.data.nextCursor ?? null,
  };
}

export interface LicenseOfferItem {
  id: string;
  reel_id: string;
  vendor_id: string;
  creator_id: string;
  amount_fils: string;
  rights_scope: "in_platform" | "off_platform" | "both";
  funding_source: "stripe" | "payout_balance";
  status:
    | "pending_creator"
    | "countered"
    | "completed"
    | "declined"
    | "expired"
    | "cancelled";
  message: string | null;
  expires_at: string;
  created_at: string;
}

export async function getCreatorLicenseOffers(): Promise<LicenseOfferItem[]> {
  const res = await api.get("/me/creator/licensing/offers");
  return res.data.data as LicenseOfferItem[];
}

export async function acceptLicenseOffer(offerId: string): Promise<void> {
  await api.post(`/me/creator/licensing/offers/${offerId}/accept`);
}

export async function declineLicenseOffer(offerId: string): Promise<void> {
  await api.post(`/me/creator/licensing/offers/${offerId}/decline`);
}

export async function counterLicenseOffer(
  offerId: string,
  amount_fils: number,
  note?: string,
): Promise<LicenseOfferItem> {
  const res = await api.post(
    `/me/creator/licensing/offers/${offerId}/counter`,
    note ? { amount_fils, note } : { amount_fils },
  );
  return res.data.data as LicenseOfferItem;
}

export interface LicenseOfferEvent {
  id: string;
  offer_id: string;
  actor: "vendor" | "creator" | "system";
  event_type: string;
  amount_fils: string | null;
  note: string | null;
  created_at: string;
}

export async function getLicenseOfferEvents(
  offerId: string,
): Promise<LicenseOfferEvent[]> {
  const res = await api.get(
    `/me/creator/licensing/offers/${offerId}/events`,
  );
  return res.data.data as LicenseOfferEvent[];
}

export interface PayoutResult {
  amountFils: number;
  status: "queued";
  externalRef: string;
}

export async function requestPayout(): Promise<PayoutResult> {
  const res = await api.post("/me/creator/payout");
  return res.data.data as PayoutResult;
}

// ── Brief / bid marketplace (3c-2) ────────────────────────────────────────────

export interface CreatorOpenBrief {
  id: string;
  vendor_id: string;
  title: string;
  brief: string;
  rights_scope: "in_platform" | "off_platform" | "both";
  status: string;
  bids_close_at: string;
  budget_guide_fils: string | null;
  target_product_id: string | null;
  target_category: string | null;
  created_at: string;
}

export type CreatorBidStatus =
  | "pending"
  | "accepted"
  | "delivered"
  | "revision_requested"
  | "completed"
  | "rejected"
  | "withdrawn"
  | "declined";

export interface CreatorBid {
  bid_id: string;
  brief_id: string;
  brief_title: string;
  amount_fils: string;
  status: CreatorBidStatus;
  delivery_round: number;
  delivery_deadline_at: string | null;
  created_at: string;
}

/** Full open briefs (authenticated) — used to show a brief's body in the bid modal. */
export async function getCreatorOpenBriefs(): Promise<CreatorOpenBrief[]> {
  const res = await api.get("/me/creator/licensing/briefs");
  return res.data.data as CreatorOpenBrief[];
}

/** The creator's own bids across briefs (the My Bids tracker). */
export async function getCreatorBids(): Promise<CreatorBid[]> {
  const res = await api.get("/me/creator/licensing/bids");
  return res.data.data as CreatorBid[];
}

export async function placeBid(
  briefId: string,
  amount_fils: number,
  pitch: string,
): Promise<void> {
  await api.post(`/me/creator/licensing/briefs/${briefId}/bids`, { amount_fils, pitch });
}

export async function withdrawBid(briefId: string, bidId: string): Promise<void> {
  await api.post(`/me/creator/licensing/briefs/${briefId}/bids/${bidId}/withdraw`);
}

export async function deliverBid(
  briefId: string,
  bidId: string,
  reel_id: string,
): Promise<void> {
  await api.post(`/me/creator/licensing/briefs/${briefId}/bids/${bidId}/deliver`, { reel_id });
}
