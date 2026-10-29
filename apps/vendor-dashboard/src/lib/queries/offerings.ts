import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// Service-offering CRUD lives on product-service, mounted at /vendor/services
// (see .superpowers/sdd/phase7-recon-api.md §3). Enum literals below are the
// exact wire values — do not rename without checking the backend DTOs.

export type PaymentMode = "prepay" | "deposit" | "pay_at_venue";
export type DepositType = "percent" | "fixed" | "none";
export type CancellationRefundPolicy = "full" | "deposit_forfeit" | "percent";
export type LocationMode = "at_premises" | "home_visit" | "either";
export type OfferingStatus =
	| "draft"
	| "pending_review"
	| "published"
	| "rejected"
	| "paused"
	| "archived";

export interface ServiceOffering {
	id: string;
	vendor_id: string;
	category_id: string | null;
	slug: string;
	name: string;
	description: string | null;
	media_urls: string[];
	duration_minutes: number;
	buffer_before_minutes: number;
	buffer_after_minutes: number;
	slot_step_minutes: number;
	location_mode: LocationMode;
	payment_mode: PaymentMode;
	price_fils: number;
	deposit_type: DepositType;
	deposit_value: number | null;
	vat_rate: string; // numeric column, serializes as a string over the wire
	min_notice_minutes: number;
	max_advance_days: number;
	cancellation_window_hours: number;
	cancellation_refund_policy: CancellationRefundPolicy;
	cancellation_penalty_percent: number | null;
	reschedule_window_hours: number;
	status: OfferingStatus;
	rejection_reason?: string | null;
	// Server's verdict on what a publish request would do right now: false =>
	// goes live immediately, true => held at pending_review for admin approval.
	// Only GET /vendor/services sets it; the mutation responses do not, hence
	// optional. Absent is treated as "requires review" (the safe copy).
	publish_requires_review?: boolean;
	auto_approve: boolean;
	created_at: string;
	updated_at: string;
}

// Body accepted by POST /vendor/services and (partially, via Partial<>) by
// PATCH /vendor/services/:id. Only name, duration_minutes, price_fils are
// required on create — everything else has a server-side default. Slug is
// always server-generated; never send one.
export interface ServiceOfferingInput {
	name: string;
	// Nullable on the wire (backend DTO: Type.Optional(Type.Union([String,
	// Null()]))) — the edit form sends explicit null to clear a previously-set
	// value; omission alone is a no-op server-side (Object.assign only touches
	// present keys). Create still only ever omits (never sends null).
	description?: string | null;
	category_id?: string | null;
	media_urls?: string[];
	duration_minutes: number;
	buffer_before_minutes?: number;
	buffer_after_minutes?: number;
	slot_step_minutes?: number;
	location_mode?: LocationMode;
	payment_mode: PaymentMode;
	price_fils: number;
	deposit_type?: DepositType;
	deposit_value?: number;
	vat_rate?: number;
	min_notice_minutes?: number;
	max_advance_days?: number;
	cancellation_window_hours?: number;
	cancellation_refund_policy: CancellationRefundPolicy;
	cancellation_penalty_percent?: number;
	reschedule_window_hours?: number;
	auto_approve?: boolean;
}

// GET /vendor/services is unpaginated — returns every offering for the active
// vendor (any status), ORDER BY created_at DESC. This is also the capability
// signal for the Bookings nav group (>=1 row) and it's the source query the
// list page and the "single offering" hooks below all read from, so there is
// only ever one network call for offerings data per session.
export function useVendorServices(options: { enabled?: boolean } = {}) {
	return useQuery<ServiceOffering[]>({
		queryKey: ["vendor", "services"],
		queryFn: async () => {
			const { data } = await api.get("/vendor/services");
			return data.data ?? [];
		},
		staleTime: 60_000,
		enabled: options.enabled ?? true,
	});
}

// There is no GET /vendor/services/:id endpoint (see recon §3) — select the
// offering out of the already-fetched, unpaginated list instead of a second
// network call.
export function useVendorService(id: string) {
	const query = useVendorServices({ enabled: !!id });
	const offering = query.data?.find((o) => o.id === id);
	return { ...query, data: offering };
}

export function useCreateService() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: ServiceOfferingInput) => {
			const { data } = await api.post("/vendor/services", payload);
			return data.data as ServiceOffering;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "services"] });
		},
	});
}

export interface ServiceOfferingUpdate
	extends Partial<ServiceOfferingInput> {
	status?: OfferingStatus;
}

export function useUpdateService() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			payload,
		}: { id: string; payload: ServiceOfferingUpdate }) => {
			const { data } = await api.patch(`/vendor/services/${id}`, payload);
			return data.data as ServiceOffering;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["vendor", "services"] });
		},
	});
}
