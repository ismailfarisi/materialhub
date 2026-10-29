import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export function usePlatformStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/admin/dashboard/stats");
      return data.data;
    },
  });
}

export function usePlatformRevenue(period: string = "7d") {
  return useQuery({
    queryKey: ["admin", "revenue", period],
    queryFn: async () => {
      const { data } = await api.get("/admin/dashboard/revenue", { params: { period } });
      return data.data;
    },
  });
}
