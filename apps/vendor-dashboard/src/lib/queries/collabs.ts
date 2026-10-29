import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { FundingSource, RightsScope } from "./licensing";

export type CollabType = "product_seeding" | "paid_campaign" | "event_appearance";
export type CollabVisibility = "board" | "direct";
export type CollabStatus =
	| "draft"
	| "open"
	| "filled"
	| "completed"
	| "cancelled"
	| "expired";
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

export interface CollabDeliverable {
	kind: "reel" | "story" | "post" | "appearance";
	count: number;
}

export interface CollabOpportunity {
	id: string;
	vendor_id: string;
	type: CollabType;
	visibility: CollabVisibility;
	status: CollabStatus;
	title: string;
	description: string;
	deliverables: CollabDeliverable[] | null;
	slots_total: number;
	slots_filled: number;
	applications_close_at: string | null;
	deliver_by: string | null;
	min_follower_count: number | null;
	required_platforms: string[] | null;
	required_categories: string[] | null;
	rights_scope: RightsScope | null;
	fee_fils: string | null;
	funding_source: FundingSource | null;
	seeded_product_id: string | null;
	seeded_variant_id: string | null;
	seeded_qty: number | null;
	seeding_value_fils: string | null;
	location_id: string | null;
	starts_at: string | null;
	ends_at: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * The vendor-facing application shape.
 *
 * Note `has_address` and the absence of any address field: the backend
 * serializer never sends a creator's shipping address to a vendor. Do not add
 * one here expecting it to arrive.
 */
export interface CollabApplication {
	id: string;
	opportunity_id: string;
	creator_id: string;
	creator_name: string | null;
	creator_avatar_url: string | null;
	status: CollabApplicationStatus;
	pitch: string | null;
	proposed_fee_fils: string | null;
	agreed_fee_fils: string | null;
	delivered_reel_id: string | null;
	revision_count: number;
	has_address: boolean;
	carrier: string | null;
	tracking_number: string | null;
	shipped_at: string | null;
	received_at: string | null;
	deliver_by: string | null;
	responded_at: string | null;
	accepted_at: string | null;
	delivered_at: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface CollabEvent {
	id: string;
	opportunity_id: string;
	application_id: string | null;
	actor: "vendor" | "creator" | "system";
	event_type: string;
	amount_fils_snapshot: string | null;
	note: string | null;
	created_at: string;
}

export interface CreateCollabInput {
	type: CollabType;
	visibility: CollabVisibility;
	title: string;
	description: string;
	deliverables?: CollabDeliverable[] | null;
	slotsTotal?: number;
	applicationsCloseAt?: string | null;
	deliverBy?: string | null;
	minFollowerCount?: number | null;
	requiredCategories?: string[] | null;
	rightsScope?: RightsScope | null;
	feeFils?: number | null;
	fundingSource?: FundingSource | null;
	seededProductId?: string | null;
	seededVariantId?: string | null;
	seededQty?: number | null;
	seedingValueFils?: number | null;
	locationId?: string | null;
	startsAt?: string | null;
	endsAt?: string | null;
}

const BASE = "/vendor/reels/collabs";
const KEY = ["collabs"] as const;

export interface CollabFilter {
	status?: CollabStatus;
	type?: CollabType;
}

export function useVendorCollabs(filter: CollabFilter = {}) {
	return useQuery({
		queryKey: [...KEY, "list", filter],
		queryFn: async () => {
			const { data } = await api.get<{ data: CollabOpportunity[] }>(BASE, {
				params: filter,
			});
			return data.data;
		},
		staleTime: 30_000,
	});
}

export function useCollab(id: string | null) {
	return useQuery({
		queryKey: [...KEY, "detail", id],
		enabled: Boolean(id),
		queryFn: async () => {
			const { data } = await api.get<{
				data: { opportunity: CollabOpportunity; applications: CollabApplication[] };
			}>(`${BASE}/${id}`);
			return data.data;
		},
		staleTime: 15_000,
	});
}

export function useCollabEvents(id: string | null) {
	return useQuery({
		queryKey: [...KEY, "events", id],
		enabled: Boolean(id),
		queryFn: async () => {
			const { data } = await api.get<{ data: CollabEvent[] }>(`${BASE}/${id}/events`);
			return data.data;
		},
		staleTime: 30_000,
	});
}

/** Invalidate every collab query — list counts and detail both move on any write. */
function useCollabInvalidator() {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateCollab() {
	const invalidate = useCollabInvalidator();
	return useMutation({
		mutationFn: async (input: CreateCollabInput) => {
			const { data } = await api.post<{ data: CollabOpportunity }>(BASE, input);
			return data.data;
		},
		onSuccess: invalidate,
	});
}

export function usePublishCollab() {
	const invalidate = useCollabInvalidator();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.post<{ data: CollabOpportunity }>(`${BASE}/${id}/publish`);
			return data.data;
		},
		onSuccess: invalidate,
	});
}

export function useCancelCollab() {
	const invalidate = useCollabInvalidator();
	return useMutation({
		mutationFn: async (id: string) => {
			await api.post(`${BASE}/${id}/cancel`);
		},
		onSuccess: invalidate,
	});
}

export function useInviteCreators() {
	const invalidate = useCollabInvalidator();
	return useMutation({
		mutationFn: async ({
			id,
			creatorIds,
			note,
		}: { id: string; creatorIds: string[]; note?: string | null }) => {
			const { data } = await api.post<{ data: CollabApplication[] }>(
				`${BASE}/${id}/invite`,
				{ creatorIds, note: note?.trim() || null },
			);
			return data.data;
		},
		onSuccess: invalidate,
	});
}

type AppAction = "accept" | "decline" | "approve" | "revise" | "reject" | "ship";

interface AppActionInput {
	id: string;
	appId: string;
	action: AppAction;
	note?: string;
	carrier?: string | null;
	trackingNumber?: string | null;
}

/**
 * Every per-application vendor action goes through one mutation. They share a
 * URL shape and an invalidation target, and keeping them together makes the
 * action set visible in one place rather than scattered across six hooks.
 */
export function useCollabApplicationAction() {
	const invalidate = useCollabInvalidator();
	return useMutation({
		mutationFn: async ({ id, appId, action, note, carrier, trackingNumber }: AppActionInput) => {
			const body =
				action === "ship"
					? { carrier: carrier ?? null, trackingNumber: trackingNumber ?? null }
					: note !== undefined
						? { note }
						: undefined;
			const { data } = await api.post<{ data: unknown }>(
				`${BASE}/${id}/applications/${appId}/${action}`,
				body,
			);
			return data.data;
		},
		onSuccess: invalidate,
	});
}

export const COLLAB_TYPE_LABEL: Record<CollabType, string> = {
	product_seeding: "Product seeding",
	paid_campaign: "Paid campaign",
	event_appearance: "Event appearance",
};

export const COLLAB_STATUS_STYLE: Record<CollabStatus, string> = {
	draft: "bg-neutral-100 text-neutral-600",
	open: "bg-amber-100 text-amber-700",
	filled: "bg-blue-100 text-blue-700",
	completed: "bg-green-100 text-green-700",
	cancelled: "bg-neutral-100 text-neutral-600",
	expired: "bg-neutral-100 text-neutral-600",
};

export const APPLICATION_STATUS_STYLE: Record<CollabApplicationStatus, string> = {
	invited: "bg-purple-100 text-purple-700",
	applied: "bg-amber-100 text-amber-700",
	accepted: "bg-blue-100 text-blue-700",
	in_progress: "bg-blue-100 text-blue-700",
	delivered: "bg-indigo-100 text-indigo-700",
	revision_requested: "bg-orange-100 text-orange-700",
	completed: "bg-green-100 text-green-700",
	declined: "bg-neutral-100 text-neutral-600",
	withdrawn: "bg-neutral-100 text-neutral-600",
	rejected: "bg-red-100 text-red-700",
	expired: "bg-neutral-100 text-neutral-600",
};
