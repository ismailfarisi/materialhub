import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface PageFilters {
  status?: string;
  locale?: string;
  page?: number;
  limit?: number;
}

interface PagePayload {
  title: string;
  slug: string;
  locale: string;
  status: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
}

interface BannerFilters {
  placement?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

interface BannerPayload {
  title: string;
  subtitle?: string;
  image_url: string;
  mobile_image_url?: string;
  link_url?: string;
  placement: string;
  starts_at?: string;
  expires_at?: string;
  locale?: string;
  is_active: boolean;
  sort_order?: number;
}

export function usePages(filters: PageFilters = {}) {
  return useQuery({
    queryKey: ["admin", "cms", "pages", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.status && filters.status !== "__all__") params.status = filters.status;
      if (filters.locale && filters.locale !== "__all__") params.locale = filters.locale;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/pages", { params });
      return data.data;
    },
  });
}

export function usePage(slug: string) {
  return useQuery({
    queryKey: ["admin", "cms", "pages", slug],
    queryFn: async () => {
      const { data } = await api.get(`/pages/${slug}`);
      return data.data;
    },
    enabled: !!slug,
  });
}

export function useCreatePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PagePayload) => {
      const { data } = await api.post("/pages", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cms", "pages"] });
    },
  });
}

export function useUpdatePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<PagePayload> }) => {
      const { data } = await api.put(`/pages/${id}`, payload);
      return data.data;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cms", "pages"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "cms", "pages", id] });
    },
  });
}

export function useDeletePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/pages/${id}`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cms", "pages"] });
    },
  });
}

export function useBanners(filters: BannerFilters = {}) {
  return useQuery({
    queryKey: ["admin", "cms", "banners", filters],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {};
      if (filters.placement && filters.placement !== "__all__") params.placement = filters.placement;
      if (filters.is_active != null) params.is_active = filters.is_active;
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      const { data } = await api.get("/banners", { params });
      return data.data;
    },
  });
}

export function useCreateBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BannerPayload) => {
      const { data } = await api.post("/banners", payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cms", "banners"] });
    },
  });
}

export function useUpdateBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<BannerPayload> }) => {
      const { data } = await api.put(`/banners/${id}`, payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cms", "banners"] });
    },
  });
}

export function useDeleteBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/banners/${id}`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cms", "banners"] });
    },
  });
}

export function useSiteSettings(group?: string) {
  return useQuery({
    queryKey: ["admin", "cms", "settings", group ?? "all"],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (group) params.group = group;
      const { data } = await api.get("/settings", { params });
      return data.data;
    },
  });
}

export function useUpdateSiteSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { data } = await api.put(`/settings/${key}`, { value });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cms", "settings"] });
    },
  });
}
