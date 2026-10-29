import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface ShippingProvider {
	id: string;
	code: string;
	display_name: string;
	description: string | null;
	logo_url: string | null;
	credential_schema: Record<string, unknown>;
	supported_regions: string[];
	webhook_secret_encrypted: string | null;
	is_active: boolean;
	sort_order: number;
	vendor_account_count?: number;
	created_at: string;
	updated_at: string;
}

export interface ShippingProviderUpdate {
	display_name?: string;
	description?: string | null;
	logo_url?: string | null;
	supported_regions?: string[];
	sort_order?: number;
	is_active?: boolean;
	webhook_secret?: string;
}

export interface PlatformCarrierAccountSyncResult {
	created: boolean;
	account: {
		id: string;
		vendor_id: string | null;
		provider_id: string;
		display_name: string;
		credentials_last4: string | null;
		is_active: boolean;
		is_verified: boolean;
		verified_at: string | null;
		last_verify_error: string | null;
	};
}

const LIST_KEY = ["admin", "shipping-providers"] as const;

export function useShippingProviders() {
	return useQuery({
		queryKey: LIST_KEY,
		queryFn: async () => {
			const { data } = await api.get("/admin/shipping-providers");
			return data.data as ShippingProvider[];
		},
		staleTime: 30_000,
	});
}

export function useShippingProvider(id: string) {
	return useQuery({
		queryKey: [...LIST_KEY, id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/shipping-providers/${id}`);
			return data.data as ShippingProvider;
		},
		enabled: !!id,
	});
}

export function useUpdateShippingProvider(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (payload: ShippingProviderUpdate) => {
			const { data } = await api.patch(
				`/admin/shipping-providers/${id}`,
				payload,
			);
			return data.data as ShippingProvider;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: LIST_KEY });
			qc.invalidateQueries({ queryKey: [...LIST_KEY, id] });
		},
	});
}

export function useRotateWebhookSecret(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const { data } = await api.post(
				`/admin/shipping-providers/${id}/rotate-webhook-secret`,
			);
			return data.data as { webhook_secret: string };
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: [...LIST_KEY, id] });
		},
	});
}

export function useSyncPlatformCarrierAccount(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const { data } = await api.post(
				`/admin/shipping-providers/${id}/platform-account/sync`,
			);
			return data.data as PlatformCarrierAccountSyncResult;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: LIST_KEY });
			qc.invalidateQueries({ queryKey: [...LIST_KEY, id] });
		},
	});
}
