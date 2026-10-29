import { api } from "../api";

export type CollabType = "product_seeding" | "paid_campaign" | "event_appearance";
export type CollabApplicationStatus =
  | "invited"
  | "applied"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "in_progress"
  | "delivered"
  | "revision_requested"
  | "completed"
  | "rejected"
  | "expired";

export type EligibilityReason =
  | "below_min_followers"
  | "category_mismatch"
  | "platform_not_connected";

export interface CollabOpportunity {
  id: string;
  vendor_id: string;
  type: CollabType;
  title: string;
  description: string;
  slots_total: number;
  slots_filled: number;
  applications_close_at: string | null;
  deliver_by: string | null;
  min_follower_count: number | null;
  required_categories: string[] | null;
  fee_fils: string | null;
  seeded_qty: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  vendor_name: string | null;
  vendor_logo_url: string | null;
  seeded_product_name: string | null;
  seeded_product_image_url: string | null;
}

export interface BoardRow {
  opportunity: CollabOpportunity;
  /** Present only when the viewer is signed in. */
  eligibility?: { eligible: boolean; reasons: EligibilityReason[] };
}

export interface CollabApplication {
  id: string;
  opportunity_id: string;
  creator_id: string;
  status: CollabApplicationStatus;
  pitch: string | null;
  /** The vendor's personal note, written when they sent the invite. */
  invite_note: string | null;
  proposed_fee_fils: string | null;
  agreed_fee_fils: string | null;
  delivered_reel_id: string | null;
  shipping_address_id: string | null;
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  received_at: string | null;
  deliver_by: string | null;
  revision_count: number;
  accepted_at: string | null;
  created_at: string;
}

export interface CreatorApplicationRow {
  application: CollabApplication;
  opportunity: CollabOpportunity | null;
}

/** The open board. Anonymous callers get rows without an `eligibility` block. */
export async function getCollabBoard(): Promise<BoardRow[]> {
  const res = await api.get("/reels/collab-board");
  return res.data.data as BoardRow[];
}

export async function getMyCollabs(): Promise<CreatorApplicationRow[]> {
  const res = await api.get("/me/creator/collabs");
  return res.data.data as CreatorApplicationRow[];
}

export async function applyToCollab(
  opportunityId: string,
  input: { pitch?: string | null; proposedFeeFils?: number | null } = {},
): Promise<CollabApplication> {
  const res = await api.post(`/me/creator/collabs/${opportunityId}/apply`, input);
  return res.data.data as CollabApplication;
}

export async function respondToInvite(
  applicationId: string,
  accept: boolean,
): Promise<CollabApplication> {
  const res = await api.post(
    `/me/creator/collabs/applications/${applicationId}/${accept ? "accept" : "decline"}`,
  );
  return res.data.data as CollabApplication;
}

export async function withdrawCollab(applicationId: string): Promise<void> {
  await api.post(`/me/creator/collabs/applications/${applicationId}/withdraw`);
}

/**
 * Nominate the address a seeded product ships to.
 *
 * The vendor never sees this address — only that one exists. Worth stating in
 * the UI copy, because being asked for a home address by a marketplace is
 * reasonably something a creator hesitates over.
 */
export async function setCollabAddress(
  applicationId: string,
  addressId: string,
): Promise<CollabApplication> {
  const res = await api.post(
    `/me/creator/collabs/applications/${applicationId}/address`,
    { addressId },
  );
  return res.data.data as CollabApplication;
}

/** Confirm the seeded product arrived. This is what starts the delivery clock. */
export async function confirmCollabReceipt(
  applicationId: string,
): Promise<CollabApplication> {
  const res = await api.post(
    `/me/creator/collabs/applications/${applicationId}/confirm-receipt`,
  );
  return res.data.data as CollabApplication;
}

/** `reelId` is omitted for an event appearance, which produces no reel. */
export async function deliverCollab(
  applicationId: string,
  reelId?: string | null,
): Promise<CollabApplication> {
  const res = await api.post(
    `/me/creator/collabs/applications/${applicationId}/deliver`,
    reelId ? { reelId } : {},
  );
  return res.data.data as CollabApplication;
}
