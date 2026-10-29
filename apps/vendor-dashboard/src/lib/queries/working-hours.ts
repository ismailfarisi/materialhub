import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// Working hours + time-off share the /vendor/booking/staff/:id prefix on
// booking-service (see .superpowers/sdd/phase7-recon-api.md §3). No PATCH on
// either resource — edit is delete + recreate, per the addendum.

export interface WorkingHoursRule {
	id: string;
	staff_member_id: string;
	location_id: string | null;
	day_of_week: number; // 0-6, 0 = Sunday
	start_time: string; // "HH:MM:SS" or "HH:MM"
	end_time: string;
	effective_from: string | null;
	effective_to: string | null;
	created_at: string;
	updated_at: string;
}

export interface WorkingHoursInput {
	location_id?: string | null;
	day_of_week: number;
	start_time: string; // "HH:MM"
	end_time: string; // "HH:MM"
}

export function useWorkingHours(staffId: string) {
	return useQuery<WorkingHoursRule[]>({
		queryKey: ["vendor", "booking-staff", staffId, "working-hours"],
		queryFn: async () => {
			const { data } = await api.get(`/vendor/booking/staff/${staffId}/working-hours`);
			return data.data ?? [];
		},
		enabled: !!staffId,
	});
}

export function useCreateWorkingHours(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: WorkingHoursInput) => {
			const { data } = await api.post(
				`/vendor/booking/staff/${staffId}/working-hours`,
				payload,
			);
			return data.data as WorkingHoursRule;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "working-hours"],
			});
		},
	});
}

export function useDeleteWorkingHours(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (ruleId: string) => {
			await api.delete(`/vendor/booking/staff/${staffId}/working-hours/${ruleId}`);
			return ruleId;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "working-hours"],
			});
		},
	});
}

// ─── Time off ────────────────────────────────────────────────────────────

export interface TimeOff {
	id: string;
	staff_member_id: string;
	starts_at: string;
	ends_at: string;
	reason: string | null;
	created_at: string;
	updated_at: string;
}

export interface TimeOffInput {
	starts_at: string; // ISO instant
	ends_at: string; // ISO instant
	reason?: string | null;
}

export function useTimeOff(staffId: string) {
	return useQuery<TimeOff[]>({
		queryKey: ["vendor", "booking-staff", staffId, "time-off"],
		queryFn: async () => {
			const { data } = await api.get(`/vendor/booking/staff/${staffId}/time-off`);
			return data.data ?? [];
		},
		enabled: !!staffId,
	});
}

export function useCreateTimeOff(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: TimeOffInput) => {
			const { data } = await api.post(`/vendor/booking/staff/${staffId}/time-off`, payload);
			return data.data as TimeOff;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "time-off"],
			});
		},
	});
}

export function useDeleteTimeOff(staffId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (offId: string) => {
			await api.delete(`/vendor/booking/staff/${staffId}/time-off/${offId}`);
			return offId;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["vendor", "booking-staff", staffId, "time-off"],
			});
		},
	});
}
