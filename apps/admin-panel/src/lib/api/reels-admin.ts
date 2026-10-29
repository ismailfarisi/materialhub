import { api } from "../api";

export async function listModerationQueue(
  opts: { language?: string; cursor?: string } = {},
) {
  const res = await api.get("/admin/reels/queue", { params: opts });
  return res.data as { items: any[]; nextCursor: string | null };
}

export async function approveReel(id: string, notes?: string) {
  await api.post(`/admin/reels/${id}/approve`, { notes });
}

export async function rejectReel(id: string, reason: string, notes?: string) {
  await api.post(`/admin/reels/${id}/reject`, { reason, notes });
}

export async function flagReel(id: string, notes?: string) {
  await api.post(`/admin/reels/${id}/flag`, { notes });
}

export async function listTaggingPermissions() {
  const res = await api.get("/admin/reels/tagging-permissions");
  return (res.data?.items ?? []) as any[];
}

export async function grantTaggingPermission(payload: {
  userId: string;
  scope: "any_product" | "specific_brand" | "specific_vendor" | "specific_products";
  brandId?: string;
  vendorId?: string;
  productIds?: string[];
  expiresAt?: string;
  reason?: string;
}) {
  const res = await api.post("/admin/reels/tagging-permissions", payload);
  return res.data.data;
}

export async function revokeTaggingPermission(id: string) {
  await api.delete(`/admin/reels/tagging-permissions/${id}`);
}
