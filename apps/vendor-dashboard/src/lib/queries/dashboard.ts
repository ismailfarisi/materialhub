import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export function useVendorStats() {
  return useQuery({
    queryKey: ["vendor", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/vendor/dashboard/stats");
      return data.data;
    },
  });
}

export function useVendorWarehouses() {
  return useQuery({
    queryKey: ["vendor", "warehouses"],
    queryFn: async () => {
      const { data } = await api.get("/vendor/warehouses");
      return data.data as Array<{
        id: string;
        name: string;
        is_active: boolean;
        is_default: boolean;
      }>;
    },
  });
}

export function useRevenueChart(period: string = "7d") {
  return useQuery({
    queryKey: ["vendor", "revenue", period],
    queryFn: async () => {
      const { data } = await api.get("/vendor/dashboard/revenue", { params: { period } });
      return data.data;
    },
  });
}
