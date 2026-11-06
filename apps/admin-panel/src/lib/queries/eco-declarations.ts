import { api } from "@/lib/api";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Plastic-ban ready declarations (eco catalogue). Vendors declare a product
 * plastic-ban ready, optionally with a certificate; admins review the
 * declaration for the listing. Approval is a marketplace check, not a legal
 * certification by MaterialHub.
 */

export type EcoDeclarationStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface EcoDeclaration {
  id: string;
  product_id: string;
  vendor_id: string;
  status: EcoDeclarationStatus;
  statement: string | null;
  certificate_filename: string | null;
  has_certificate: boolean;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  product: {
    id: string;
    name: string;
    slug: string;
    status: string;
    sku: string | null;
    category_name: string | null;
  } | null;
  vendor: { id: string; name: string; slug: string } | null;
  eco_attributes: Array<{ slug: string; name: string; values: string[] }>;
}

export interface EcoDeclarationPage {
  items: EcoDeclaration[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface EcoDeclarationFilters {
  status: EcoDeclarationStatus | "all";
  q?: string;
  page?: number;
  limit?: number;
}

const KEY = ["admin", "eco-declarations"] as const;

export function useEcoDeclarations(filters: EcoDeclarationFilters) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: async () => {
      const { data } = await api.get("/admin/eco-declarations", {
        params: {
          status: filters.status,
          q: filters.q?.trim() || undefined,
          page: filters.page ?? 1,
          limit: filters.limit ?? 20,
        },
      });
      return data.data as EcoDeclarationPage;
    },
    placeholderData: keepPreviousData,
  });
}

export async function fetchCertificateUrl(id: string): Promise<string> {
  const { data } = await api.get(`/admin/eco-declarations/${id}/certificate-url`);
  return (data.data as { url: string }).url;
}

export function useApproveEcoDeclaration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/admin/eco-declarations/${id}/approve`);
      return data.data as EcoDeclaration;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRejectEcoDeclaration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await api.patch(`/admin/eco-declarations/${id}/reject`, { reason });
      return data.data as EcoDeclaration;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
