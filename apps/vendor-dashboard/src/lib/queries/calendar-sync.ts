import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// Per-staff iCal calendar sync (Phase 6 Tasks 4-5, wired into the vendor
// dashboard here in Phase 7 Task 7). Both directions live on booking-service's
// /manage surface — see .superpowers/sdd/phase7-recon-api.md §3:
//
// - Inbound (import FROM another calendar): PUT/GET/DELETE
//   /manage/staff/:id/calendar-subscription. One subscription per staff
//   member (upsert semantics on PUT). DELETE immediately releases every
//   engagement the feed had imported, not just on the next poll tick.
// - Outbound (publish this staff member's calendar): POST
//   /manage/staff/:id/calendar-feed-url. Deterministic — re-issuing always
//   returns the identical URL, since the token is a pure HMAC with no stored
//   per-issue state (see calendar-feed-url.service.ts). POST, not GET,
//   because there's nothing stored to read back; it's an "issue me the link"
//   action, matching this repo's other action-shaped /manage POSTs.
//
// Both directions are strictly one-way and eventually consistent — see the
// copy in CalendarSyncPanel.tsx for the vendor-facing explanation.

export interface CalendarSubscription {
	id: string;
	staff_member_id: string;
	vendor_id: string;
	ical_url: string;
	last_synced_at: string | null;
	last_sync_error: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export function useCalendarSubscription(staffId: string) {
	return useQuery<CalendarSubscription | null>({
		queryKey: ["vendor", "booking-staff", staffId, "calendar-subscription"],
		queryFn: async () => {
			const { data } = await api.get(`/manage/staff/${staffId}/calendar-subscription`);
			return data.data ?? null;
		},
		enabled: !!staffId,
	});
}

export function useUpsertCalendarSubscription(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (icalUrl: string) => {
			const { data } = await api.put(`/manage/staff/${staffId}/calendar-subscription`, {
				ical_url: icalUrl,
			});
			return data.data as CalendarSubscription;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "calendar-subscription"],
			});
		},
	});
}

export function useDeleteCalendarSubscription(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			await api.delete(`/manage/staff/${staffId}/calendar-subscription`);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "calendar-subscription"],
			});
		},
	});
}

export interface IssuedCalendarFeedUrl {
	url: string;
}

// No query hook / cache for this — the brief's UI pattern is an explicit
// "Issue feed URL" button (POST is an action, not a resource read; see the
// header comment above). Calling it again is safe (idempotent, same URL).
export function useIssueCalendarFeedUrl(staffId: string) {
	return useMutation({
		mutationFn: async () => {
			const { data } = await api.post(`/manage/staff/${staffId}/calendar-feed-url`, {});
			return data.data as IssuedCalendarFeedUrl;
		},
	});
}
