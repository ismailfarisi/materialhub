import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export type BnplThreshold = {
  provider: "tabby" | "tamara";
  min_amount_fils: number;
  max_amount_fils: number;
  plans: { installments: number; interval_days: number }[];
  surcharge_fils: number;
};

export function useBnplThresholds() {
  return useQuery({
    queryKey: ["bnpl-thresholds"],
    queryFn: async () => {
      const { data } = await api.get<{ data: BnplThreshold[] }>("/checkout/bnpl-thresholds");
      return data.data;
    },
    staleTime: 30 * 60 * 1000, // 30 min — thresholds change rarely
  });
}
