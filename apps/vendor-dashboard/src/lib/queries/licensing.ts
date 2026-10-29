import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type RightsScope = "in_platform" | "off_platform" | "both";
export type FundingSource = "stripe" | "payout_balance";
export type OfferStatus =
  | "pending_creator"
  | "countered"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled";

export interface OfferEvent {
  id: string;
  offer_id: string;
  actor: "vendor" | "creator" | "system";
  event_type: string;
  amount_fils: string | null;
  note: string | null;
  created_at: string;
}

export interface LicenseOffer {
  id: string;
  reel_id: string;
  vendor_id: string;
  creator_id: string;
  amount_fils: string;
  rights_scope: RightsScope;
  funding_source: FundingSource;
  status: OfferStatus;
  last_actor: "vendor" | "creator" | "system";
  expires_at: string;
  message: string | null;
  completed_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOfferInput {
  reel_id: string;
  amount_fils: number;
  rights_scope: RightsScope;
  funding_source: FundingSource;
  message?: string;
  payment_method_id?: string;
}

export function useMyOffers() {
  return useQuery({
    queryKey: ["licensing", "offers"],
    queryFn: async () => {
      const { data } = await api.get<{ data: LicenseOffer[] }>(
        "/vendor/reels/licensing/offers",
      );
      return data.data;
    },
    staleTime: 30_000,
  });
}

export function useLicensingBalance() {
  return useQuery({
    queryKey: ["licensing", "balance"],
    queryFn: async () => {
      const { data } = await api.get<{ data: { available_fils: number } }>(
        "/vendor/reels/licensing/balance",
      );
      return data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOfferInput) => {
      const { data } = await api.post<{ data: LicenseOffer }>(
        "/vendor/reels/licensing/offers",
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licensing", "offers"] });
      qc.invalidateQueries({ queryKey: ["licensing", "balance"] });
    },
  });
}

export function useCancelOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      await api.post(`/vendor/reels/licensing/offers/${offerId}/cancel`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licensing", "offers"] });
      qc.invalidateQueries({ queryKey: ["licensing", "balance"] });
    },
  });
}

export interface AcceptCounterInput {
  offerId: string;
  payment_method_id?: string;
}

export function useAcceptCounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ offerId, payment_method_id }: AcceptCounterInput) => {
      const { data } = await api.post<{ data: LicenseOffer }>(
        `/vendor/reels/licensing/offers/${offerId}/accept-counter`,
        payment_method_id ? { payment_method_id } : {},
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licensing", "offers"] });
      qc.invalidateQueries({ queryKey: ["licensing", "balance"] });
    },
  });
}

export interface ReOfferInput {
  offerId: string;
  amount_fils: number;
  payment_method_id?: string;
}

export function useReOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      offerId,
      amount_fils,
      payment_method_id,
    }: ReOfferInput) => {
      const body: { amount_fils: number; payment_method_id?: string } = {
        amount_fils,
      };
      if (payment_method_id) body.payment_method_id = payment_method_id;
      const { data } = await api.post<{ data: LicenseOffer }>(
        `/vendor/reels/licensing/offers/${offerId}/re-offer`,
        body,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licensing", "offers"] });
      qc.invalidateQueries({ queryKey: ["licensing", "balance"] });
    },
  });
}

export function useOfferEvents(offerId: string | null) {
  return useQuery({
    queryKey: ["licensing", "events", offerId],
    queryFn: async () => {
      const { data } = await api.get<{ data: OfferEvent[] }>(
        `/vendor/reels/licensing/offers/${offerId}/events`,
      );
      return data.data;
    },
    enabled: !!offerId,
    staleTime: 15_000,
  });
}

// ── Rights delivery: grants, features (pins), downloads (2c) ──────────────────

export interface LicenseGrant {
  id: string;
  reel_id: string;
  vendor_id: string;
  creator_id: string;
  offer_id: string;
  scope: RightsScope;
  amount_fils: string;
  gross_fils: string | null;
  fee_fils: string | null;
  net_fils: string | null;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  active: boolean;
}

export type FeaturePlacement = "product" | "storefront";

export interface GrantFeature {
  id: string;
  grant_id: string;
  reel_id: string;
  vendor_id: string;
  placement: FeaturePlacement;
  product_id: string | null;
  position: number | null;
  created_at: string;
}

export function useGrants() {
  return useQuery({
    queryKey: ["licensing", "grants"],
    queryFn: async () => {
      const { data } = await api.get<{ data: LicenseGrant[] }>(
        "/vendor/reels/licensing/grants",
      );
      return data.data;
    },
    staleTime: 30_000,
  });
}

export function useGrantFeatures(grantId: string | null) {
  return useQuery({
    queryKey: ["licensing", "grant-features", grantId],
    queryFn: async () => {
      const { data } = await api.get<{ data: GrantFeature[] }>(
        `/vendor/reels/licensing/grants/${grantId}/features`,
      );
      return data.data;
    },
    enabled: !!grantId,
    staleTime: 15_000,
  });
}

export interface PinFeatureInput {
  grantId: string;
  placement: FeaturePlacement;
  product_id?: string;
  position?: number;
}

export function usePinFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      grantId,
      placement,
      product_id,
      position,
    }: PinFeatureInput) => {
      const body: {
        placement: FeaturePlacement;
        product_id?: string;
        position?: number;
      } = { placement };
      if (product_id) body.product_id = product_id;
      if (position != null) body.position = position;
      const { data } = await api.post<{ data: GrantFeature }>(
        `/vendor/reels/licensing/grants/${grantId}/feature`,
        body,
      );
      return data.data;
    },
    onSuccess: (_data, { grantId }) => {
      qc.invalidateQueries({
        queryKey: ["licensing", "grant-features", grantId],
      });
      qc.invalidateQueries({ queryKey: ["licensing", "grants"] });
    },
  });
}

export interface UnpinFeatureInput {
  featureId: string;
  /** The grant the feature belongs to, so we can invalidate its features query. */
  grantId: string;
}

export function useUnpinFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ featureId }: UnpinFeatureInput) => {
      const { data } = await api.delete<{ data: { unpinned: true } }>(
        `/vendor/reels/licensing/features/${featureId}`,
      );
      return data.data;
    },
    onSuccess: (_data, { grantId }) => {
      qc.invalidateQueries({
        queryKey: ["licensing", "grant-features", grantId],
      });
    },
  });
}

export interface DownloadResult {
  url: string;
  expiresAt: string;
}

export function useRequestDownload() {
  return useMutation({
    mutationFn: async (grantId: string) => {
      const { data } = await api.post<{ data: DownloadResult }>(
        `/vendor/reels/licensing/grants/${grantId}/download`,
      );
      return data.data;
    },
  });
}

// ── Brief / bid marketplace (3c) ──────────────────────────────────────────────

export type BriefStatus = "open" | "awarded" | "fulfilled" | "cancelled" | "expired";
export type BriefBidStatus =
  | "pending"
  | "accepted"
  | "delivered"
  | "revision_requested"
  | "completed"
  | "rejected"
  | "withdrawn"
  | "declined";

export interface VendorBrief {
  id: string;
  vendor_id: string;
  title: string;
  brief: string;
  rights_scope: RightsScope;
  status: BriefStatus;
  awarded_bid_id: string | null;
  bids_close_at: string;
  budget_guide_fils: string | null;
  target_product_id: string | null;
  target_category: string | null;
  created_at: string;
  updated_at: string;
}

export interface BriefBid {
  id: string;
  brief_id: string;
  creator_id: string;
  amount_fils: string;
  pitch: string;
  status: BriefBidStatus;
  delivery_round: number;
  delivered_reel_id: string | null;
  delivery_deadline_at: string | null;
  grant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BriefDetail {
  brief: VendorBrief;
  bids: BriefBid[];
}

export interface CreateBriefInput {
  title: string;
  brief: string;
  rights_scope: RightsScope;
  bids_close_at: string; // ISO
  budget_guide_fils?: number;
  target_product_id?: string;
  target_category?: string;
}

export type UpdateBriefInput = Partial<Omit<CreateBriefInput, "rights_scope">>;

export function useVendorBriefs() {
  return useQuery({
    queryKey: ["licensing", "briefs"],
    queryFn: async () => {
      const { data } = await api.get<{ data: VendorBrief[] }>(
        "/vendor/reels/licensing/briefs",
      );
      return data.data;
    },
    staleTime: 30_000,
  });
}

export function useVendorBrief(briefId: string | null) {
  return useQuery({
    queryKey: ["licensing", "brief", briefId],
    queryFn: async () => {
      const { data } = await api.get<{ data: BriefDetail }>(
        `/vendor/reels/licensing/briefs/${briefId}`,
      );
      return data.data;
    },
    enabled: !!briefId,
    staleTime: 15_000,
  });
}

export function useCreateBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBriefInput) => {
      const { data } = await api.post<{ data: VendorBrief }>(
        "/vendor/reels/licensing/briefs",
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licensing", "briefs"] });
    },
  });
}

export function useUpdateBrief(briefId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateBriefInput) => {
      const { data } = await api.patch<{ data: VendorBrief }>(
        `/vendor/reels/licensing/briefs/${briefId}`,
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licensing", "briefs"] });
      qc.invalidateQueries({ queryKey: ["licensing", "brief", briefId] });
    },
  });
}

export function useCancelBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (briefId: string) => {
      await api.post(`/vendor/reels/licensing/briefs/${briefId}/cancel`);
    },
    onSuccess: (_d, briefId) => {
      qc.invalidateQueries({ queryKey: ["licensing", "briefs"] });
      qc.invalidateQueries({ queryKey: ["licensing", "brief", briefId] });
    },
  });
}

export interface AcceptBidInput {
  briefId: string;
  bidId: string;
  funding_source: FundingSource;
  payment_method_id?: string;
}

export function useAcceptBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ briefId, bidId, funding_source, payment_method_id }: AcceptBidInput) => {
      const body: { funding_source: FundingSource; payment_method_id?: string } = { funding_source };
      if (payment_method_id) body.payment_method_id = payment_method_id;
      const { data } = await api.post<{ data: BriefBid }>(
        `/vendor/reels/licensing/briefs/${briefId}/bids/${bidId}/accept`,
        body,
      );
      return data.data;
    },
    onSuccess: (_d, { briefId }) => {
      qc.invalidateQueries({ queryKey: ["licensing", "brief", briefId] });
      qc.invalidateQueries({ queryKey: ["licensing", "balance"] });
    },
  });
}

export interface BidActionInput {
  briefId: string;
  bidId: string;
  note?: string;
}

export function useApproveDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ briefId, bidId }: { briefId: string; bidId: string }) => {
      const { data } = await api.post<{ data: LicenseGrant }>(
        `/vendor/reels/licensing/briefs/${briefId}/bids/${bidId}/approve`,
      );
      return data.data;
    },
    onSuccess: (_d, { briefId }) => {
      qc.invalidateQueries({ queryKey: ["licensing", "brief", briefId] });
      qc.invalidateQueries({ queryKey: ["licensing", "grants"] });
    },
  });
}

export function useReviseDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ briefId, bidId, note }: BidActionInput) => {
      const { data } = await api.post<{ data: BriefBid }>(
        `/vendor/reels/licensing/briefs/${briefId}/bids/${bidId}/revise`,
        note ? { note } : {},
      );
      return data.data;
    },
    onSuccess: (_d, { briefId }) => {
      qc.invalidateQueries({ queryKey: ["licensing", "brief", briefId] });
    },
  });
}

export function useRejectDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ briefId, bidId, note }: BidActionInput) => {
      await api.post(
        `/vendor/reels/licensing/briefs/${briefId}/bids/${bidId}/reject`,
        note ? { note } : {},
      );
    },
    onSuccess: (_d, { briefId }) => {
      qc.invalidateQueries({ queryKey: ["licensing", "brief", briefId] });
      qc.invalidateQueries({ queryKey: ["licensing", "balance"] });
    },
  });
}

// Minimal single-reel read for the delivered-reel preview. The field names are
// typed optional and the preview (Task 5) degrades gracefully if absent.
export interface ReelPreviewData {
  id: string;
  thumbnail_url?: string | null;
  video_playback_url?: string | null;
  caption?: string | null;
}

export function useReel(reelId: string | null) {
  return useQuery({
    queryKey: ["reel", reelId],
    queryFn: async () => {
      const { data } = await api.get<{ data: ReelPreviewData }>(`/reels/${reelId}`);
      return data.data;
    },
    enabled: !!reelId,
    staleTime: 60_000,
  });
}
