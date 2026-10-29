import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export function useCartAbandonmentStats() {
  return useQuery({
    queryKey: ["admin", "cart-abandonment", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/admin/cart-abandonment/stats");
      return data.data;
    },
  });
}
