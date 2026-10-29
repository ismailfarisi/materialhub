import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface BnplPlan {
  installments: number;
  interval_days: number;
}

export type PaymentMethodProvider = "tabby" | "tamara" | "cod";

export interface PaymentMethodThreshold {
  provider: PaymentMethodProvider;
  min_amount_fils: number;
  max_amount_fils: number;
  plans: BnplPlan[];
  is_active: boolean;
  surcharge_fils: number | null;
  updated_at: string;
}

const LIST_KEY = ["admin", "payment-methods"] as const;

export function usePaymentMethods() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/payment-methods");
      return data.data as PaymentMethodThreshold[];
    },
    staleTime: 30_000,
  });
}

export function useTogglePaymentMethod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { provider: PaymentMethodProvider; is_active: boolean }) => {
      const { data } = await api.patch(`/admin/payment-methods/${args.provider}`, {
        is_active: args.is_active,
      });
      return data.data as Pick<PaymentMethodThreshold, "provider" | "is_active">;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

export function useUpdateCodSurcharge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { surcharge_fils: number }) => {
      const { data } = await api.patch("/admin/payment-methods/cod", {
        surcharge_fils: args.surcharge_fils,
      });
      return data.data as Pick<PaymentMethodThreshold, "provider" | "surcharge_fils">;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}
