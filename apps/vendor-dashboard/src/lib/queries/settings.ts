import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function useVendorProfile() {
  return useQuery({
    queryKey: ["vendor", "profile"],
    queryFn: async () => {
      const { data } = await api.get("/vendors/me");
      return data.data;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.patch("/vendors/me/settings", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "profile"] });
    },
  });
}

/** PATCH /vendors/me/tax { trn } — changing it clears trn_verified_at. */
export function useUpdateVendorTax() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { trn: string | null }) => {
      const { data } = await api.patch("/vendors/me/tax", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "profile"] });
    },
  });
}

export function useBankAccounts() {
  return useQuery({
    queryKey: ["vendor", "bank-accounts"],
    queryFn: async () => {
      const { data } = await api.get("/vendors/me/bank-accounts");
      return data.data;
    },
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.post("/vendors/me/bank-accounts", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "bank-accounts"] });
    },
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { data } = await api.patch(`/vendors/me/bank-accounts/${id}`, payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "bank-accounts"] });
    },
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/vendors/me/bank-accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "bank-accounts"] });
    },
  });
}

/** PATCH /vendors/me/bank-accounts/:id/primary — payouts go to this account. */
export function useSetPrimaryBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/vendors/me/bank-accounts/${id}/primary`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "bank-accounts"] });
    },
  });
}
