import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HeaderNavConfig, HeaderNavRecord } from "./types";

const KEY = ["admin-header-navigation"] as const;

export function useHeaderNavDraft() {
	return useQuery({
		queryKey: KEY,
		queryFn: async (): Promise<HeaderNavRecord | null> => {
			const { data } = await api.get<{ data: HeaderNavRecord | null }>(
				"/admin/header-navigation/draft",
			);
			return data.data;
		},
	});
}

export function useUpsertHeaderNavDraft() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (config: HeaderNavConfig) => {
			const { data } = await api.put<{ data: HeaderNavRecord }>(
				"/admin/header-navigation/draft",
				config,
			);
			return data.data;
		},
		// Sync the cache with the server's response instead of invalidating.
		// Invalidating would trigger a refetch that updates the `draft` ref,
		// causing the editor's hydration effect to re-fire and rewrite local
		// state — which then re-fires auto-save in an infinite loop.
		onSuccess: (data) => qc.setQueryData(KEY, data),
	});
}

export function usePublishHeaderNav() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const { data } = await api.post<{ data: HeaderNavRecord }>(
				"/admin/header-navigation/publish",
			);
			return data.data;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}
