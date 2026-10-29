import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface AiEnhanceSettings {
	enabled: boolean;
	model: string;
	prompt: string;
	per_vendor_monthly_cap: number;
	per_vendor_per_minute_cap: number;
	/** True if an api_key is stored in the DB. Raw key is never returned. */
	api_key_set: boolean;
	/** Visual confirmation like "••••wxyz" or null. */
	api_key_preview: string | null;
}

/** PATCH payload. `api_key` is write-only — only include it when the user typed one. */
export interface AiEnhanceSettingsPatch {
	enabled?: boolean;
	model?: string;
	prompt?: string;
	per_vendor_monthly_cap?: number;
	per_vendor_per_minute_cap?: number;
	/** New key to store, or empty string to clear it. */
	api_key?: string;
}

const KEY = ["admin", "settings", "ai", "image-enhance"] as const;

export function useAiEnhanceSettings() {
	return useQuery({
		queryKey: KEY,
		queryFn: async () =>
			(await api.get("/admin/settings/ai/image-enhance")).data
				.data as AiEnhanceSettings,
	});
}

export function useUpdateAiEnhanceSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (partial: AiEnhanceSettingsPatch) =>
			(await api.patch("/admin/settings/ai/image-enhance", partial)).data
				.data as AiEnhanceSettings,
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}

export function useTestAiPrompt() {
	return useMutation({
		mutationFn: async (body: { sample_key: string; prompt?: string }) =>
			(await api.post("/admin/settings/ai/image-enhance/test", body)).data
				.data as {
				preview_url: string;
				no_change_detected: boolean;
			},
	});
}

export interface ProductContentAiSettings {
	enabled: boolean;
	provider: "qwen";
	base_url: string;
	model: string;
	prompt: string;
	timeout_ms: number;
	api_key_set: boolean;
	api_key_preview: string | null;
	env_key_set: boolean;
}

export interface ProductContentAiSettingsPatch {
	enabled?: boolean;
	base_url?: string;
	model?: string;
	prompt?: string;
	timeout_ms?: number;
	api_key?: string;
}

export const productAiSettingsQueryKey = [
	"admin",
	"settings",
	"ai",
	"product-content",
] as const;

export function useProductContentAiSettings() {
	return useQuery({
		queryKey: productAiSettingsQueryKey,
		queryFn: async () =>
			(await api.get("/admin/settings/ai/product-content")).data
				.data as ProductContentAiSettings,
	});
}

export function useUpdateProductContentAiSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (partial: ProductContentAiSettingsPatch) =>
			(await api.patch("/admin/settings/ai/product-content", partial)).data
				.data as ProductContentAiSettings,
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: productAiSettingsQueryKey }),
	});
}
