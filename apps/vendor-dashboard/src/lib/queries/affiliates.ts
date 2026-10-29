import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface VendorAffiliate {
  id: string;
  user_id: string | null;
  invite_email: string | null;
  status: "invited" | "active" | "suspended" | "revoked";
  commission_type: "percentage" | "fixed";
  commission_value: number;
  affiliate_code: string;
  joined_at: string | null;
  created_at: string;
}

export interface InviteAffiliateInput {
  email?: string;
  userId?: string;
  commissionType: "percentage" | "fixed";
  commissionValue: number;
}

export interface SetAffiliateRateInput {
  id: string;
  commissionType: "percentage" | "fixed";
  commissionValue: number;
}

export interface SetAffiliateStatusInput {
  id: string;
  status: "active" | "suspended" | "revoked";
}

const KEY = ["vendor", "affiliates"] as const;

export function useVendorAffiliates() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<VendorAffiliate[]> => {
      const { data } = await api.get<{ data: VendorAffiliate[] }>("/vendor/affiliates");
      return data.data;
    },
  });
}

export function useInviteAffiliate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteAffiliateInput) => {
      const { data } = await api.post<{ data: VendorAffiliate }>("/vendor/affiliates", input);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetAffiliateRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, commissionType, commissionValue }: SetAffiliateRateInput) => {
      const { data } = await api.patch<{ data: VendorAffiliate }>(`/vendor/affiliates/${id}/rate`, {
        commissionType,
        commissionValue,
      });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetAffiliateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: SetAffiliateStatusInput) => {
      const { data } = await api.patch<{ data: VendorAffiliate }>(
        `/vendor/affiliates/${id}/status`,
        { status },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface VendorAffiliateLink {
  id: string;
  slug: string;
  target_type: string;
  target_id: string | null;
  click_count: number;
}

export interface VendorAffiliateDetail {
  affiliate: VendorAffiliate;
  links: VendorAffiliateLink[];
}

export interface CreateAffiliateLinkInput {
  targetType: "store" | "product";
  targetId?: string | null;
}

export function useVendorAffiliate(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => {
      const res = await api.get(`/vendor/affiliates/${id}`);
      return res.data?.data as VendorAffiliateDetail | null;
    },
    enabled: !!id,
  });
}

export function useCreateAffiliateLink(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAffiliateLinkInput) => {
      const res = await api.post(`/vendor/affiliates/${id}/links`, input);
      return res.data?.data as VendorAffiliateLink;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, id] }),
  });
}
