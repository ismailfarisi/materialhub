import type { CollabApplication } from "@materialhub/database";

/**
 * The vendor-facing shape of an application.
 *
 * `shipping_address_id` is deliberately absent. A vendor never needs the
 * creator's home address — the shipping label comes from the fulfilment path,
 * not from an API response — and leaking it would hand a creator's home address
 * to every vendor they collaborate with. All the vendor needs to know is whether
 * one has been provided yet.
 *
 * Every vendor-facing route MUST send applications through this function. It is
 * the single choke point, which is what makes the leak testable.
 */
export interface VendorFacingApplication {
  id: string;
  opportunity_id: string;
  creator_id: string;
  creator_name: string | null;
  creator_avatar_url: string | null;
  status: string;
  pitch: string | null;
  proposed_fee_fils: string | null;
  agreed_fee_fils: string | null;
  delivered_reel_id: string | null;
  revision_count: number;
  /** Whether the creator has chosen a shipping address — never which one. */
  has_address: boolean;
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: Date | null;
  received_at: Date | null;
  deliver_by: Date | null;
  responded_at: Date | null;
  accepted_at: Date | null;
  delivered_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Optionally already hydrated with the applicant's name/avatar (see
 *  hydrateApplicationCreators); falls back to null when the caller has not. */
type MaybeHydratedApplication = CollabApplication & {
  creator_name?: string | null;
  creator_avatar_url?: string | null;
};

export function toVendorFacingApplication(app: MaybeHydratedApplication): VendorFacingApplication {
  return {
    id: app.id,
    opportunity_id: app.opportunity_id,
    creator_id: app.creator_id,
    creator_name: app.creator_name ?? null,
    creator_avatar_url: app.creator_avatar_url ?? null,
    status: app.status,
    pitch: app.pitch,
    proposed_fee_fils: app.proposed_fee_fils,
    agreed_fee_fils: app.agreed_fee_fils,
    delivered_reel_id: app.delivered_reel_id,
    revision_count: app.revision_count,
    has_address: app.shipping_address_id != null,
    carrier: app.carrier,
    tracking_number: app.tracking_number,
    shipped_at: app.shipped_at,
    received_at: app.received_at,
    deliver_by: app.deliver_by,
    responded_at: app.responded_at,
    accepted_at: app.accepted_at,
    delivered_at: app.delivered_at,
    completed_at: app.completed_at,
    created_at: app.created_at,
    updated_at: app.updated_at,
  };
}

export function toVendorFacingApplications(
  apps: MaybeHydratedApplication[],
): VendorFacingApplication[] {
  return apps.map(toVendorFacingApplication);
}
