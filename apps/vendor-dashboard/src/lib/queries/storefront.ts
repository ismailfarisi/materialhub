import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface StorefrontInitResult {
	layout_id: string;
	draft_version_id: string;
}

export interface MyStorefront {
	id: string;
	slug: string;
	title: Record<string, string>;
	status: string;
	vendor_id: string;
	published_version_id: string | null;
	draft_version_id: string | null;
	sections?: unknown[];
}

export function useInitStorefront() {
	const qc = useQueryClient();
	return useMutation<StorefrontInitResult>({
		mutationFn: async () => {
			const { data } = await api.post("/vendor-layouts/me/init");
			return data.data;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["my-storefront"] });
		},
	});
}

export function useMyStorefront() {
	return useQuery<MyStorefront | null>({
		queryKey: ["my-storefront"],
		queryFn: async () => {
			try {
				const { data } = await api.get("/vendor-layouts/me");
				return data.data;
			} catch (err: unknown) {
				if (
					err &&
					typeof err === "object" &&
					"response" in err &&
					(err as { response?: { status?: number } }).response?.status === 404
				) {
					return null;
				}
				throw err;
			}
		},
		retry: false,
	});
}

export function useStorefrontPreviewToken() {
	return useMutation({
		mutationFn: async (layoutId: string) => {
			const { data } = await api.post<{
				data: { token: string; layout_slug: string; expires_at: string };
			}>(`/vendor-layouts/${layoutId}/preview-token`);
			return data.data;
		},
	});
}
