import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface PublicHoliday {
	id: string;
	/** "YYYY-MM-DD", Asia/Dubai. */
	holiday_date: string;
	name: string;
	name_ar: string | null;
	country_code: string;
	/** True until the UAE government confirms the date (moon sighting). */
	is_estimate: boolean;
	is_active: boolean;
	created_at: string;
	updated_at: string;
}

export type PublicHolidayInput = Pick<
	PublicHoliday,
	"holiday_date" | "name" | "name_ar" | "is_estimate" | "is_active"
>;

const KEY = ["admin", "public-holidays"] as const;

export function usePublicHolidays(year: number) {
	return useQuery({
		queryKey: [...KEY, year],
		queryFn: async () => {
			const { data } = await api.get("/admin/public-holidays", {
				params: { year: String(year) },
			});
			return (data.data ?? []) as PublicHoliday[];
		},
	});
}

export function useCreatePublicHoliday() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: PublicHolidayInput) => {
			const { data } = await api.post("/admin/public-holidays", input);
			return data.data as PublicHoliday;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}

export function useUpdatePublicHoliday() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			patch,
		}: { id: string; patch: Partial<PublicHolidayInput> }) => {
			const { data } = await api.patch(`/admin/public-holidays/${id}`, patch);
			return data.data as PublicHoliday;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}

export function useDeletePublicHoliday() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			await api.delete(`/admin/public-holidays/${id}`);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}
