import { useAuthStore } from "@/stores/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const LS_KEY = "recent-searches";
const MAX = 10;

function readLocal(): string[] {
	if (typeof window === "undefined") return [];
	try {
		return (
			JSON.parse(window.localStorage.getItem(LS_KEY) || "[]") as string[]
		).slice(0, MAX);
	} catch {
		return [];
	}
}

function writeLocal(list: string[]): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX)));
}

export function useRecentSearches() {
	const { isAuthenticated } = useAuthStore();
	return useQuery({
		queryKey: ["recent-searches", isAuthenticated],
		queryFn: async () => {
			if (!isAuthenticated) return readLocal().map((q) => ({ query: q }));
			const { data } = await api.get("/me/recent-searches");
			return (data.data as Array<{ query: string }>) || [];
		},
		staleTime: 60_000,
	});
}

export function useRecordRecentSearch() {
	const queryClient = useQueryClient();
	const { isAuthenticated } = useAuthStore();
	return useMutation({
		mutationFn: async (query: string) => {
			const trimmed = query.trim();
			if (!trimmed) return;
			if (isAuthenticated) {
				await api.post("/me/recent-searches", { query: trimmed });
			} else {
				const list = readLocal();
				const next = [trimmed, ...list.filter((x) => x !== trimmed)].slice(
					0,
					MAX,
				);
				writeLocal(next);
			}
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["recent-searches"] }),
	});
}

export function useClearRecentSearches() {
	const queryClient = useQueryClient();
	const { isAuthenticated } = useAuthStore();
	return useMutation({
		mutationFn: async (query?: string) => {
			if (isAuthenticated) {
				await api.delete("/me/recent-searches", {
					params: query ? { query } : undefined,
				});
			} else {
				if (query) writeLocal(readLocal().filter((q) => q !== query));
				else writeLocal([]);
			}
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["recent-searches"] }),
	});
}
