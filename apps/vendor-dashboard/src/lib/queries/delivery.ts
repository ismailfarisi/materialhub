import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface WarehouseDeliverySettings {
	dispatch_cutoff_time: string;
	handling_days: number;
	working_days: number[];
	same_day_emirates: string[];
	next_day_emirates: string[];
}

export interface WarehouseDelivery extends WarehouseDeliverySettings {
	warehouse_id: string;
	name: string;
	code: string;
	emirate: string;
	is_default: boolean;
}

export interface DeliveryPreview {
	earliest: string;
	latest: string;
	dispatchDate: string;
	cutoffAt: string;
	minutesToCutoff: number;
	speed: "same_day" | "next_day" | "standard";
	basis: "same_day_zone" | "next_day_zone" | "shipping_rate" | "default";
	transitDays: { min: number; max: number };
	dependsOnEstimatedHoliday: boolean;
}

export function useWarehouseDelivery() {
	return useQuery({
		queryKey: ["vendor", "warehouse-delivery"],
		queryFn: async () => {
			const { data } = await api.get("/vendor/warehouses/delivery");
			return (data.data ?? []) as WarehouseDelivery[];
		},
	});
}

export function useSaveWarehouseDelivery() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			settings,
		}: { id: string; settings: WarehouseDeliverySettings }) => {
			const { data } = await api.patch(
				`/vendor/warehouses/${id}/delivery`,
				settings,
			);
			return data.data as WarehouseDelivery;
		},
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: ["vendor", "warehouse-delivery"],
			}),
	});
}

/** Live preview of the promise for unsaved settings (nothing is stored). */
export function useDeliveryPreview(
	id: string | undefined,
	settings: WarehouseDeliverySettings | null,
	emirate: string,
) {
	return useQuery({
		queryKey: ["vendor", "warehouse-delivery-preview", id, settings, emirate],
		queryFn: async () => {
			const { data } = await api.post(
				`/vendor/warehouses/${id}/delivery/preview`,
				{
					...settings,
					emirate,
				},
			);
			return data.data as DeliveryPreview;
		},
		enabled: Boolean(id && settings && settings.working_days.length > 0),
		placeholderData: (prev) => prev,
		refetchInterval: 60_000,
	});
}
