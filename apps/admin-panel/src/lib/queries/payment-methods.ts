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

const PROVIDER_LABELS: Record<string, string> = { cod: "COD", tabby: "Tabby", tamara: "Tamara" };

/** "COD", "Tabby", "Tamara"; unknown providers are title-cased. */
export function paymentProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

export type PaymentMethodAmountField = "surcharge_fils" | "min_amount_fils" | "max_amount_fils";

/** Client-side check matching the API: whole fils, 0 or more, min ≤ max. */
export function validatePaymentMethodAmount(
  row: Pick<PaymentMethodThreshold, "min_amount_fils" | "max_amount_fils">,
  field: PaymentMethodAmountField,
  fils: number,
): string | null {
  if (!Number.isSafeInteger(fils) || fils < 0) return "Enter an amount of 0 or more.";
  if (field === "min_amount_fils" && fils > row.max_amount_fils)
    return "The minimum can't be above the maximum.";
  if (field === "max_amount_fils" && fils < row.min_amount_fils)
    return "The maximum can't be below the minimum.";
  return null;
}

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

/** Edit one amount (fils) on a payment method: COD surcharge, or min/max order totals. */
export function useUpdatePaymentMethodAmount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      provider: PaymentMethodProvider;
      field: PaymentMethodAmountField;
      fils: number;
    }) => {
      const { data } = await api.patch(`/admin/payment-methods/${args.provider}`, {
        [args.field]: args.fils,
      });
      return data.data as PaymentMethodThreshold;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}
