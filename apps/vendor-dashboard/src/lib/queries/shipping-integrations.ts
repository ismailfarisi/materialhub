import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface CredentialSchemaField {
	type: "string" | "number";
	title: string;
	description?: string;
	format?: "password" | "url";
	pattern?: string;
}
export interface CredentialSchema {
	type: "object";
	required: string[];
	properties: Record<string, CredentialSchemaField>;
}

export interface AvailableProvider {
	id: string;
	code: string;
	display_name: string;
	description: string | null;
	logo_url: string | null;
	supported_regions: string[];
	credential_schema: CredentialSchema;
}

export interface VendorIntegration {
	id: string;
	vendor_id: string;
	provider_id: string;
	provider?: AvailableProvider;
	display_name: string;
	credentials_last4: string | null;
	is_active: boolean;
	is_verified: boolean;
	verified_at: string | null;
	last_verify_error: string | null;
	created_at: string;
	updated_at: string;
}

const LIST_KEY = ["vendor", "shipping-integrations"] as const;
const PROVIDERS_KEY = ["vendor", "shipping-integrations", "providers"] as const;

export function useAvailableProviders() {
	return useQuery({
		queryKey: PROVIDERS_KEY,
		queryFn: async () => {
			const { data } = await api.get("/vendor/shipping-integrations/providers");
			return data.data as AvailableProvider[];
		},
		staleTime: 60_000,
	});
}

export function useMyIntegrations() {
	return useQuery({
		queryKey: LIST_KEY,
		queryFn: async () => {
			const { data } = await api.get("/vendor/shipping-integrations");
			return data.data as VendorIntegration[];
		},
		staleTime: 30_000,
	});
}

export function useIntegration(id: string) {
	return useQuery({
		queryKey: [...LIST_KEY, id],
		queryFn: async () => {
			const { data } = await api.get(`/vendor/shipping-integrations/${id}`);
			return data.data as VendorIntegration;
		},
		enabled: !!id,
	});
}

export function useCreateIntegration() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (payload: {
			provider_id: string;
			display_name: string;
			credentials: Record<string, string>;
		}) => {
			const { data } = await api.post("/vendor/shipping-integrations", payload);
			return data.data as VendorIntegration;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
	});
}

export function useUpdateIntegration(id: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (payload: {
			display_name?: string;
			is_active?: boolean;
			credentials?: Record<string, string>;
		}) => {
			const { data } = await api.patch(
				`/vendor/shipping-integrations/${id}`,
				payload,
			);
			return data.data as VendorIntegration;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: LIST_KEY });
			qc.invalidateQueries({ queryKey: [...LIST_KEY, id] });
		},
	});
}

export function useVerifyIntegration() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.post(
				`/vendor/shipping-integrations/${id}/verify`,
			);
			return data.data as { ok: boolean; message?: string };
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
	});
}

export function useSetDefaultIntegration() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.patch(
				`/vendor/shipping-integrations/${id}/set-default`,
			);
			return data.data as { default_shipping_account_id: string };
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
	});
}

export function useDeleteIntegration() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.delete(`/vendor/shipping-integrations/${id}`);
			return data.data as { id: string };
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
	});
}
