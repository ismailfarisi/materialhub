import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface AdminAffiliateFilters {
  vendorId?: string;
  page?: number;
  limit?: number;
}

export interface AdminAffiliateRow {
  id: string;
  vendor_id: string;
  vendor?: { id: string; name: string } | null;
  user_id: string | null;
  user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  invite_email: string | null;
  status: "invited" | "active" | "suspended" | "revoked";
  commission_type: "percentage" | "fixed";
  commission_value: number;
  affiliate_code: string;
  joined_at: string | null;
  created_at: string;
}

export interface AdminAffiliateCommissionRow {
  id: string;
  vendor_affiliate_id: string;
  vendor_id: string;
  order_id: string;
  vendor_order_id: string;
  order_item_id: string;
  product_id: string;
  gross_fils: string;
  commission_type_snapshot: "percentage" | "fixed";
  commission_value_snapshot: number;
  commission_fils: string;
  status: "pending" | "earned" | "paid" | "reversed";
  eligible_at: string | null;
  earned_at: string | null;
  reversed_reason: string | null;
  created_at: string;
}

export interface AdminAffiliateLinkRow {
  id: string;
  vendor_affiliate_id: string;
  target_type: "store" | "product" | "brand" | "custom_url";
  target_id: string | null;
  target_url: string | null;
  slug: string;
  click_count: number;
  created_at: string;
}

export interface AdminInviteAffiliateInput {
  vendorId: string;
  email?: string;
  userId?: string;
  commissionType: "percentage" | "fixed";
  commissionValue: number;
}

export interface AdminUpdateAffiliateRateInput {
  id: string;
  commissionType: "percentage" | "fixed";
  commissionValue: number;
}

export interface AdminUpdateAffiliateStatusInput {
  id: string;
  status: "active" | "suspended" | "revoked";
}

export interface AdminCreateAffiliateLinkInput {
  targetType: "store" | "product" | "brand" | "custom_url";
  targetId?: string | null;
  targetUrl?: string | null;
}

const root = ["admin", "affiliates"] as const;

export function useAdminAffiliates(filters: AdminAffiliateFilters = {}) {
  return useQuery({
    queryKey: [...root, "list", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.vendorId) params.vendorId = filters.vendorId;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/admin/affiliates", { params });
      return {
        items: data.data as AdminAffiliateRow[],
        total: (data.meta?.total ?? 0) as number,
      };
    },
  });
}

export function useAdminAffiliate(affiliateId: string | undefined) {
  return useQuery({
    queryKey: [...root, "detail", affiliateId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/affiliates/${affiliateId}`);
      return data.data as {
        affiliate: AdminAffiliateRow;
        links: AdminAffiliateLinkRow[];
      };
    },
    enabled: !!affiliateId,
  });
}

export function useAdminAffiliateLinks(affiliateId: string | undefined) {
  return useQuery({
    queryKey: [...root, "links", affiliateId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/affiliates/${affiliateId}/links`);
      return data.data as AdminAffiliateLinkRow[];
    },
    enabled: !!affiliateId,
  });
}

export function useAdminAffiliateCommissions(affiliateId: string | undefined) {
  return useQuery({
    queryKey: [...root, "commissions", affiliateId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/affiliates/${affiliateId}/commissions`);
      return data.data as AdminAffiliateCommissionRow[];
    },
    enabled: !!affiliateId,
  });
}

export function useAdminInviteAffiliate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdminInviteAffiliateInput) => {
      const { data } = await api.post("/admin/affiliates", input);
      return data.data as AdminAffiliateRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: root });
    },
  });
}

export function useAdminUpdateAffiliateRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: AdminUpdateAffiliateRateInput) => {
      const { data } = await api.patch(`/admin/affiliates/${id}/rate`, input);
      return data.data as AdminAffiliateRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: root });
    },
  });
}

export function useAdminUpdateAffiliateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: AdminUpdateAffiliateStatusInput) => {
      const { data } = await api.patch(`/admin/affiliates/${id}/status`, {
        status,
      });
      return data.data as AdminAffiliateRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: root });
    },
  });
}

export function useAdminCreateAffiliateLink(affiliateId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdminCreateAffiliateLinkInput) => {
      const { data } = await api.post(`/admin/affiliates/${affiliateId}/links`, input);
      return data.data as AdminAffiliateLinkRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...root, "links", affiliateId],
      });
      queryClient.invalidateQueries({
        queryKey: [...root, "detail", affiliateId],
      });
    },
  });
}
