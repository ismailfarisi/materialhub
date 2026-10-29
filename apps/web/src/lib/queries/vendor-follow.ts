import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type FollowedVendor = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  rating_avg?: number | null;
  follower_count?: number | null;
  location?: string | null;
  product_count?: number | null;
};

export function useFollowState(vendorId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["vendor-follow-state", vendorId],
    queryFn: async () => {
      const { data } = await api.get<{ data: { vendor_id: string; following: boolean } }>(
        `/me/follows/vendors/${vendorId}`,
      );
      return data.data.following;
    },
    enabled: !!vendorId && enabled,
    staleTime: 60 * 1000,
    retry: false, // 401 → guest; surface as "not following" not an error
  });
}

export function useFollowVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vendorId: string) => {
      const { data } = await api.post<{ data: { vendor_id: string; followed: true } }>(
        `/me/follows/vendors/${vendorId}`,
      );
      return data.data;
    },
    onSuccess: (_data, vendorId) => {
      qc.setQueryData(["vendor-follow-state", vendorId], true);
      qc.invalidateQueries({ queryKey: ["vendor-recent-follows"] });
    },
  });
}

export function useUnfollowVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vendorId: string) => {
      const { data } = await api.delete<{ data: { vendor_id: string; followed: false } }>(
        `/me/follows/vendors/${vendorId}`,
      );
      return data.data;
    },
    onSuccess: (_data, vendorId) => {
      qc.setQueryData(["vendor-follow-state", vendorId], false);
      qc.invalidateQueries({ queryKey: ["vendor-recent-follows"] });
    },
  });
}

export function useRecentFollowedVendors(limit = 4, enabled = true) {
  return useQuery({
    queryKey: ["vendor-recent-follows", limit],
    queryFn: async () => {
      const { data } = await api.get<{ data: FollowedVendor[] }>(
        `/me/follows/vendors/recent?limit=${limit}`,
      );
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled,
  });
}
