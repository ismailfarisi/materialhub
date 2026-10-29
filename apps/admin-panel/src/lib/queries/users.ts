import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface UserFilters {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export function useUsers(filters: UserFilters = {}) {
  return useQuery({
    queryKey: ["admin", "users", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.search) params.search = filters.search;
      if (filters.role && filters.role !== "__all__") params.role = filters.role;
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/users", { params });
      return data.data;
    },
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data } = await api.patch(`/admin/users/${id}/status`, { status });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useChangeUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { data } = await api.patch(`/admin/users/${id}/role`, { role });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useUpdateUserCreatorTier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, creator_tier }: { id: string; creator_tier: string }) => {
      const { data } = await api.patch(`/admin/users/${id}/creator-tier`, { creator_tier });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ["admin", "users", id],
    queryFn: async () => {
      const { data } = await api.get(`/admin/users/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export interface AdminUserAddress {
  id: string;
  user_id: string;
  label: string | null;
  type: "shipping" | "billing" | "both";
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone_verified: boolean;
  address_line_1: string | null;
  address_line_2: string | null;
  building_name: string | null;
  apartment: string | null;
  floor: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country_code: string | null;
  latitude: string | null;
  longitude: string | null;
  area_id: string | null;
  delivery_notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function useUserAddresses(id: string) {
  return useQuery<AdminUserAddress[]>({
    queryKey: ["admin", "users", id, "addresses"],
    queryFn: async () => {
      const { data } = await api.get(`/admin/users/${id}/addresses`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useUpdateUserAddress(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      addressId,
      patch,
    }: {
      addressId: string;
      patch: Partial<AdminUserAddress>;
    }) => {
      const { data } = await api.patch(`/admin/users/${id}/addresses/${addressId}`, patch);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users", id, "addresses"] });
    },
  });
}

export function useDeleteUserAddress(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (addressId: string) => {
      const { data } = await api.delete(`/admin/users/${id}/addresses/${addressId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users", id, "addresses"] });
    },
  });
}
