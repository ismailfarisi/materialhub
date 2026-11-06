import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EcoDeclaration } from "@/components/products/eco/eco-declaration.helpers";
import { api } from "../api";
import { s3UploadClient } from "../s3-upload-client";

const key = (productId: string) => ["vendor", "products", productId, "eco-declaration"];

export function useEcoDeclaration(productId: string) {
	return useQuery({
		queryKey: key(productId),
		queryFn: async (): Promise<EcoDeclaration | null> => {
			const { data } = await api.get(`/products/${productId}/eco-declaration`);
			return data.data ?? null;
		},
		enabled: !!productId,
	});
}

export function useSaveEcoDeclaration(productId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (payload: Record<string, unknown>): Promise<EcoDeclaration> => {
			const { data } = await api.put(`/products/${productId}/eco-declaration`, payload);
			return data.data;
		},
		onSuccess: (decl) => qc.setQueryData(key(productId), decl),
	});
}

export function useWithdrawEcoDeclaration(productId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (): Promise<EcoDeclaration | null> => {
			const { data } = await api.delete(`/products/${productId}/eco-declaration`);
			return data.data ?? null;
		},
		onSuccess: (decl) => qc.setQueryData(key(productId), decl),
	});
}

/**
 * Upload a certificate to private storage: presign with the
 * `eco_certificate` asset type, then PUT the file. Returns the storage key
 * to send with the declaration.
 */
export async function uploadEcoCertificate(
	file: File,
	onProgress?: (pct: number) => void,
): Promise<string> {
	const { data } = await api.post("/media/presign", {
		asset_type: "eco_certificate",
		filename: file.name,
		content_type: file.type,
	});
	const presigned = data.data ?? data;
	await s3UploadClient.putToS3(presigned.uploadUrl, file, onProgress);
	return presigned.key;
}

export async function fetchEcoCertificateUrl(productId: string): Promise<string> {
	const { data } = await api.get(`/products/${productId}/eco-declaration/certificate-url`);
	return (data.data ?? data).url;
}
