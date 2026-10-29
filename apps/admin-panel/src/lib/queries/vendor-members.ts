import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type VendorMemberRole = "owner" | "manager" | "staff" | "viewer";
export type VendorMemberStatus = "pending" | "active" | "revoked";
/** Roles an admin can assign (the owner seat is managed by the vendor). */
export type AssignableRole = "manager" | "staff" | "viewer";

export interface VendorMember {
  id: string;
  user_id: string | null;
  email: string;
  role: VendorMemberRole;
  status: VendorMemberStatus;
  invite_expires_at: string | null;
  expired: boolean;
  joined_or_invited_at: string;
}

const key = (vendorId: string) => ["admin", "vendor-members", vendorId];

export function useVendorMembers(vendorId: string) {
  return useQuery({
    queryKey: key(vendorId),
    queryFn: async () => {
      const { data } = await api.get(`/admin/vendors/${vendorId}/members`);
      return data.data as VendorMember[];
    },
    enabled: !!vendorId,
  });
}

export function useInviteVendorMember(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { email: string; role: AssignableRole }) => {
      const { data } = await api.post(`/admin/vendors/${vendorId}/members/invite`, payload);
      return data.data as { memberId: string; expiresAt: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(vendorId) }),
  });
}

export function useChangeVendorMemberRole(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { memberId: string; role: AssignableRole }) => {
      await api.patch(`/admin/vendors/${vendorId}/members/${payload.memberId}`, {
        role: payload.role,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(vendorId) }),
  });
}

export function useRemoveVendorMember(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      await api.delete(`/admin/vendors/${vendorId}/members/${memberId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(vendorId) }),
  });
}
