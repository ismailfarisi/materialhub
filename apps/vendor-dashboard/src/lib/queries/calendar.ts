import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EngagementKind, EngagementStatus } from "../booking/calendar-style";

// Unified vendor calendar read + vendor booking mutations, built in Task 0A
// (GET /manage/calendar) and Task 0B (complete/no-show/reschedule) of this
// phase — see .superpowers/sdd/task-6-brief.md's controller addendum for the
// exact shapes, cross-checked against
// backend/libs/dto/src/booking-manage.dto.ts directly.

export interface CalendarBookingSummary {
	id: string;
	booking_number: string;
	status:
		| "pending_payment"
		| "confirmed"
		| "rescheduled"
		| "cancelled"
		| "completed"
		| "no_show"
		| "expired";
	source: string;
	payment_mode: "prepay" | "deposit" | "pay_at_venue";
	service_name: string;
	price_fils: number;
	notes: string | null;
	location_id: string | null;
	customer_name: string | null;
}

export interface CalendarEngagement {
	id: string;
	staff_member_id: string;
	kind: EngagementKind;
	status: EngagementStatus;
	starts_at: string;
	ends_at: string;
	external_source: string | null;
	external_ref: string | null;
	booking: CalendarBookingSummary | null;
}

export interface CalendarQueryParams {
	from: string; // ISO instant
	to: string; // ISO instant
	staffMemberId?: string;
	vendorLocationId?: string;
}

// ~60s gentle polling per the addendum ("a gentle polling interval (~60s)"),
// on top of the refetch-on-filter-change/refetch-on-mutation React Query
// already gives for free via query-key changes + invalidateQueries below.
const POLL_MS = 60_000;

export function useCalendar(params: CalendarQueryParams | undefined) {
	return useQuery<CalendarEngagement[]>({
		queryKey: [
			"vendor",
			"calendar",
			params?.from,
			params?.to,
			params?.staffMemberId ?? null,
			params?.vendorLocationId ?? null,
		],
		queryFn: async () => {
			const { data } = await api.get("/manage/calendar", {
				params: {
					from: params?.from,
					to: params?.to,
					staff_member_id: params?.staffMemberId,
					vendor_location_id: params?.vendorLocationId,
				},
			});
			return data.data ?? [];
		},
		enabled: !!params?.from && !!params?.to,
		refetchInterval: POLL_MS,
		refetchOnWindowFocus: true,
	});
}

function invalidateCalendar(queryClient: ReturnType<typeof useQueryClient>) {
	// Broad prefix invalidation — every day/week/filter variant of the
	// calendar query shares the ["vendor","calendar"] prefix.
	queryClient.invalidateQueries({ queryKey: ["vendor", "calendar"] });
}

// ─── Walk-in / phone booking ────────────────────────────────────────────

export interface CreateManualBookingInput {
	staff_member_id: string;
	vendor_location_id: string;
	service_id?: string | null;
	starts_at: string;
	ends_at: string;
	kind: "walk_in" | "phone";
	customer_name?: string | null;
	customer_phone?: string | null;
	notes?: string | null;
}

export function useCreateManualBooking() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: CreateManualBookingInput) => {
			const { data } = await api.post("/manage/bookings", payload);
			return data.data as { engagement: unknown; booking: unknown };
		},
		onSuccess: () => invalidateCalendar(queryClient),
	});
}

// ─── Block time / break ─────────────────────────────────────────────────

export interface CreateBlockInput {
	staff_member_id: string;
	vendor_location_id: string;
	starts_at: string;
	ends_at: string;
	kind: "manual_block" | "break";
	reason?: string | null;
}

export function useCreateBlock() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: CreateBlockInput) => {
			const { data } = await api.post("/manage/blocks", payload);
			return data.data;
		},
		onSuccess: () => invalidateCalendar(queryClient),
	});
}

export function useDeleteBlock() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			try {
				await api.delete(`/manage/blocks/${id}`);
			} catch (err: unknown) {
				const e = err as { response?: { status?: number } };
				// 404 = already gone — treated as success (addendum: "404s are
				// treated as already-gone").
				if (e?.response?.status !== 404) throw err;
			}
			return id;
		},
		onSuccess: () => invalidateCalendar(queryClient),
	});
}

// ─── Complete / no-show / reschedule (Task 0B vendor-manage routes) ──────

export function useCompleteBooking() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (bookingId: string) => {
			const { data } = await api.post(`/manage/bookings/${bookingId}/complete`, {});
			return data.data as { booking: CalendarBookingSummary };
		},
		onSuccess: () => invalidateCalendar(queryClient),
	});
}

export interface NoShowInput {
	bookingId: string;
	reason?: string | null;
}

export interface NoShowResult {
	booking: CalendarBookingSummary;
	forfeit_fils: number;
	refund_fils: number;
	action: "none" | "void" | "partial_capture" | "refund";
	policy: string;
}

export function useNoShowBooking() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ bookingId, reason }: NoShowInput) => {
			const { data } = await api.post(`/manage/bookings/${bookingId}/no-show`, {
				reason: reason || undefined,
			});
			return data.data as NoShowResult;
		},
		onSuccess: () => invalidateCalendar(queryClient),
	});
}

export interface RescheduleInput {
	bookingId: string;
	starts_at: string;
	ends_at: string;
	staff_member_id?: string;
}

export function useRescheduleBooking() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ bookingId, ...body }: RescheduleInput) => {
			const { data } = await api.post(`/manage/bookings/${bookingId}/reschedule`, body);
			return data.data as { booking: CalendarBookingSummary };
		},
		onSuccess: () => invalidateCalendar(queryClient),
	});
}
