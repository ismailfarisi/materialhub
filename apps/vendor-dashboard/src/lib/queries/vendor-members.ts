import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { getMembershipsFromToken } from "../auth";
import { useActiveVendor } from "@/stores/active-vendor";

export interface MemberRow {
  id: string;
  user_id: string | null;
  email: string;
  role: "owner" | "manager" | "staff" | "viewer";
  status: "active" | "pending" | "revoked";
  invite_expires_at: string | null;
  expired: boolean;
  joined_or_invited_at: string;
}

export interface InvitePreview {
  vendorName: string;
  role: "owner" | "manager" | "staff" | "viewer";
  invitedEmail: string;
  expiresAt: string;
  status: "pending" | "active" | "revoked";
  expired: boolean;
}

/**
 * Resolve the active vendor id for outgoing requests.
 * Returns the persisted picker selection, or — for single-membership users —
 * the only membership's vid (since the backend auto-resolves but the UI
 * still needs to know which vendor it's operating on).
 */
function useActiveVid(): string | null {
  const fromStore = useActiveVendor((s) => s.activeVendorId);
  if (fromStore) return fromStore;
  if (typeof window === "undefined") return null;
  const memberships = getMembershipsFromToken();
  if (memberships.length === 1) return memberships[0].vid;
  return null;
}

// ─── Owner-side hooks ────────────────────────────────────────────

export function useTeamMembers() {
  const vid = useActiveVid();
  return useQuery<MemberRow[]>({
    queryKey: ["team-members", vid],
    queryFn: async () => {
      if (!vid) throw new Error("No active vendor");
      const res = await api.get<{ data: MemberRow[] }>(`/vendors/${vid}/members`);
      return res.data.data;
    },
    enabled: Boolean(vid),
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  const vid = useActiveVid();
  return useMutation({
    mutationFn: async (input: { email: string; role: "manager" | "staff" | "viewer" }) => {
      if (!vid) throw new Error("No active vendor");
      await api.post(`/vendors/${vid}/members/invite`, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members", vid] }),
  });
}

export function useChangeRole() {
  const qc = useQueryClient();
  const vid = useActiveVid();
  return useMutation({
    mutationFn: async (input: {
      memberId: string;
      role: "manager" | "staff" | "viewer";
    }) => {
      if (!vid) throw new Error("No active vendor");
      await api.patch(`/vendors/${vid}/members/${input.memberId}`, { role: input.role });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members", vid] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  const vid = useActiveVid();
  return useMutation({
    mutationFn: async (memberId: string) => {
      if (!vid) throw new Error("No active vendor");
      await api.delete(`/vendors/${vid}/members/${memberId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members", vid] }),
  });
}

export function useResendInvite() {
  const qc = useQueryClient();
  const vid = useActiveVid();
  return useMutation({
    mutationFn: async (memberId: string) => {
      if (!vid) throw new Error("No active vendor");
      await api.post(`/vendors/${vid}/members/${memberId}/resend`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members", vid] }),
  });
}

export function useTransferOwnership() {
  const qc = useQueryClient();
  const vid = useActiveVid();
  return useMutation({
    mutationFn: async (targetMemberId: string) => {
      if (!vid) throw new Error("No active vendor");
      await api.post(`/vendors/${vid}/members/transfer-ownership`, { targetMemberId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members", vid] }),
  });
}

// ─── Invitee-side hooks (no active-vendor needed) ────────────────

export function useInvitePreview(token: string) {
  return useQuery<InvitePreview>({
    queryKey: ["invite-preview", token],
    queryFn: async () => {
      const res = await api.get<{ data: InvitePreview }>(
        `/vendor-members/invite/${token}`,
      );
      return res.data.data;
    },
    enabled: Boolean(token),
    retry: false,
  });
}

export function useAcceptInvite() {
  return useMutation({
    mutationFn: async (token: string) => {
      await api.post(`/vendor-members/accept`, { token });
    },
  });
}

export function useDeclineInvite() {
  return useMutation({
    mutationFn: async (token: string) => {
      await api.post(`/vendor-members/decline`, { token });
    },
  });
}
