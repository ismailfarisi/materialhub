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

export function useVendorHolidays() {
  return useQuery({
    queryKey: ["vendor", "holidays"],
    queryFn: async () => {
      const { data } = await api.get("/vendors/me/holidays");
      return data.data;
    },
  });
}

export function useCreateHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; starts_at: string; ends_at: string }) => {
      const { data } = await api.post("/vendors/me/holidays", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "holidays"] });
    },
  });
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/vendors/me/holidays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor", "holidays"] });
    },
  });
}
