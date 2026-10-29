import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useAuthStore } from "@/stores/auth";

// Map backend address entity to frontend shape
function mapAddress(addr: any) {
  return {
    ...addr,
    full_name: addr.full_name || `${addr.first_name || ""} ${addr.last_name || ""}`.trim(),
    street: addr.street || addr.address_line_1,
    area: addr.area || addr.address_line_2 || "",
    building_name: addr.building_name || "",
    apartment: addr.apartment || "",
    floor: addr.floor || "",
    emirate: addr.emirate || addr.state || "",
  };
}

// Addresses
export function useAddresses() {
  return useQuery({
    queryKey: ["addresses"],
    queryFn: async () => {
      const { data } = await api.get("/auth/me/addresses");
      return (data.data || []).map(mapAddress);
    },
  });
}

export function useCreateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: object) => {
      const { data } = await api.post("/auth/me/addresses", address);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });
}

export function useUpdateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...address }: { id: string } & Record<string, unknown>) => {
      const { data } = await api.patch(`/auth/me/addresses/${id}`, address);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/auth/me/addresses/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });
}

// Verified phones (OTP gate for saving an address phone number)
export function useVerifiedPhones() {
  return useQuery<{ phone: string; verified_at: string }[]>({
    queryKey: ["account", "verified-phones"],
    queryFn: async () => {
      const { data } = await api.get("/auth/me/verified-phones");
      return data.data;
    },
  });
}

export function useStartPhoneVerification() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const { data } = await api.post("/auth/me/verified-phones/start", { phone });
      return data.data as { phone: string; retry_after_seconds: number };
    },
  });
}

export function useConfirmPhoneVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ phone, code }: { phone: string; code: string }) => {
      const { data } = await api.post("/auth/me/verified-phones/confirm", { phone, code });
      return data.data as { phone: string; verified_at: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account", "verified-phones"] });
    },
  });
}

// Wishlist
// The product-service returns wishlist rows with the related product (incl.
// images/vendor/brand). Flatten each row into the shape ProductCard expects,
// keeping product_id so the heart-state check on cards/PDP keeps working.
function flattenWishlistRow(row: any) {
  const p = row.product ?? {};
  const images = (p.images ?? [])
    .slice()
    .sort(
      (a: any, b: any) =>
        (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )
    .map((img: any) => img.card_url ?? img.url)
    .filter(Boolean);
  return {
    id: p.id,
    product_id: p.id,
    variant_id: row.variant_id ?? null,
    name: p.name,
    slug: p.slug,
    price_min: p.price,
    price_max: p.price,
    compare_at_price: p.compare_at_price ?? null,
    images,
    rating_avg: Number(p.rating_avg) || 0,
    review_count: p.rating_count ?? 0,
    vendor_name: p.vendor?.business_name,
    vendor_id: p.vendor_id,
    brand_name: p.brand?.name,
  };
}

export function useWishlist() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ["wishlist"],
    queryFn: async () => {
      const { data } = await api.get("/wishlist");
      return (data.items ?? []).map(flattenWishlistRow);
    },
    // Guests always 401 here — don't fire the request for them.
    enabled: isAuthenticated,
  });
}

export function useRemoveFromWishlist() {
  const queryClient = useQueryClient();
  return useMutation({
    // Removal is the same toggle endpoint — it deletes the row when present.
    mutationFn: async (productId: string) => {
      await api.post(`/wishlist/${productId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wishlist"] }),
  });
}

// Wallet
export function useWallet() {
  return useQuery({
    queryKey: ["wallet"],
    queryFn: async () => {
      const { data } = await api.get("/auth/me/wallet");
      return data.data;
    },
  });
}

export function useWalletTransactions(params?: { page?: number }) {
  return useQuery({
    queryKey: ["wallet-transactions", params],
    queryFn: async () => {
      const { data } = await api.get("/auth/me/wallet/transactions", { params });
      return data.data;
    },
  });
}

// Wishlist Toggle (add/remove via product-service API)
export function useToggleWishlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const { data } = await api.post(`/wishlist/${productId}`);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wishlist"] }),
  });
}

// Recently Viewed
export function useRecentlyViewed(limit = 8) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ["recently-viewed", limit],
    queryFn: async () => {
      const { data } = await api.get("/recently-viewed", { params: { limit } });
      return data.data;
    },
    // Guests always 401 here — don't fire the request for them.
    enabled: isAuthenticated,
  });
}

export function useRecordView() {
  return useMutation({
    mutationFn: async (productId: string) => {
      const { data } = await api.post(`/recently-viewed/${productId}`);
      return data.data;
    },
  });
}

// Saved Searches
export function useSavedSearches(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ["saved-searches", params],
    queryFn: async () => {
      const { data } = await api.get("/saved-searches", { params });
      return data;
    },
  });
}

export function useCreateSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name?: string; query: string; filters?: Record<string, unknown>; notify_on_match?: boolean }) => {
      const { data } = await api.post("/saved-searches", payload);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-searches"] }),
  });
}

export function useUpdateSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) => {
      const { data } = await api.patch(`/saved-searches/${id}`, payload);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-searches"] }),
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/saved-searches/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-searches"] }),
  });
}

// Recommendations
export function useRecommendations(limit = 12) {
  return useQuery({
    queryKey: ["recommendations", limit],
    queryFn: async () => {
      const { data } = await api.get("/recommendations", { params: { limit } });
      return data.data;
    },
  });
}

// Referrals
export function useMyReferralCode() {
  return useQuery({
    queryKey: ["referral-code"],
    queryFn: async () => {
      const { data } = await api.get("/me/referral-code");
      return data.data;
    },
  });
}

export function useMyReferrals(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ["referrals", params],
    queryFn: async () => {
      const { data } = await api.get("/me/referrals", { params });
      return data;
    },
  });
}

// Creator application
export interface CreatorApplication {
  id: string;
  status: "pending" | "needs_info" | "approved" | "rejected";
  review_notes: string | null;
}

export function useMyCreatorApplication() {
  return useQuery({
    queryKey: ["creator-application"],
    queryFn: async () => {
      const { data } = await api.get("/me/creator/application");
      return (data.data ?? null) as CreatorApplication | null;
    },
  });
}

export function useApplyForCreator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      display_name: string;
      bio: string;
      primary_category: string;
      social_links: Record<string, string>;
      follower_estimate?: number;
      sample_urls?: string[];
      motivation?: string;
      agreed_to_terms: boolean;
    }) => {
      const { data } = await api.post("/me/creator/apply", payload);
      return data.data as CreatorApplication;
    },
    onSuccess: (application) =>
      queryClient.setQueryData(["creator-application"], application),
  });
}

// Settings
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: object) => {
      const { data } = await api.patch("/auth/me", profile);
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: {
      current_password: string;
      new_password: string;
    }) => {
      const { data } = await api.post("/auth/change-password", payload);
      return data.data;
    },
  });
}
