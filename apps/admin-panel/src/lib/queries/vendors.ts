import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface VendorFilters {
	status?: string;
	page?: number;
	limit?: number;
}

export function useVendors(filters: VendorFilters = {}) {
	return useQuery({
		queryKey: ["admin", "vendors", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.status && filters.status !== "__all__")
				params.status = filters.status;
			if (filters.page != null) params.page = filters.page;
			if (filters.limit != null) params.limit = filters.limit;
			const { data } = await api.get("/admin/vendors", { params });
			return data.data;
		},
	});
}

export function useVendor(id: string) {
	return useQuery({
		queryKey: ["admin", "vendors", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/vendors/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}

export function useVendorDocuments(vendorId: string) {
	return useQuery({
		queryKey: ["admin", "vendors", vendorId, "documents"],
		queryFn: async () => {
			const { data } = await api.get(`/admin/vendors/${vendorId}/documents`);
			return data.data;
		},
		enabled: !!vendorId,
	});
}

export function useApproveVendor() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.patch(`/admin/vendors/${id}/approve`);
			return data.data;
		},
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors", id] });
		},
	});
}

export function useRejectVendor() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
			const { data } = await api.patch(`/admin/vendors/${id}/reject`, {
				reason,
			});
			return data.data;
		},
		onSuccess: (_data, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors", id] });
		},
	});
}

export function useSuspendVendor() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
			const { data } = await api.patch(`/admin/vendors/${id}/suspend`, {
				reason,
			});
			return data.data;
		},
		onSuccess: (_data, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors", id] });
		},
	});
}

export function useCreateVendor() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: Record<string, any>) => {
			const { data } = await api.post("/admin/vendors", payload);
			return data.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
		},
	});
}

export function useUpdateVendor() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			...payload
		}: { id: string; [key: string]: any }) => {
			const { data } = await api.patch(`/admin/vendors/${id}`, payload);
			return data.data;
		},
		onSuccess: (_data, { id }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors", id] });
		},
	});
}

export function useUsePlatformShipping() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ vendorId }: { vendorId: string }) => {
			const { data } = await api.patch(
				`/admin/vendors/${vendorId}/use-platform-shipping`,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId],
			});
		},
	});
}

export function useUploadVendorDocument() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorId,
			...payload
		}: { vendorId: string; [key: string]: any }) => {
			const { data } = await api.post(
				`/admin/vendors/${vendorId}/documents`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId, "documents"],
			});
		},
	});
}

export function useVerifyDocument() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorId,
			docId,
		}: { vendorId: string; docId: string }) => {
			const { data } = await api.patch(
				`/admin/vendors/${vendorId}/documents/${docId}/verify`,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId, "documents"],
			});
		},
	});
}

export function useRejectDocument() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorId,
			docId,
			reason,
		}: { vendorId: string; docId: string; reason: string }) => {
			const { data } = await api.patch(
				`/admin/vendors/${vendorId}/documents/${docId}/reject`,
				{ reason },
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId, "documents"],
			});
		},
	});
}

export function useUpdateDocument() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorId,
			docId,
			...payload
		}: { vendorId: string; docId: string; [key: string]: any }) => {
			const { data } = await api.patch(
				`/admin/vendors/${vendorId}/documents/${docId}`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId, "documents"],
			});
		},
	});
}

export function useDeleteDocument() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorId,
			docId,
		}: { vendorId: string; docId: string }) => {
			const { data } = await api.delete(
				`/admin/vendors/${vendorId}/documents/${docId}`,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId, "documents"],
			});
		},
	});
}

export function useVendorBankAccounts(vendorId: string) {
	return useQuery({
		queryKey: ["admin", "vendors", vendorId, "bank-accounts"],
		queryFn: async () => {
			const { data } = await api.get(
				`/admin/vendors/${vendorId}/bank-accounts`,
			);
			return data.data;
		},
		enabled: !!vendorId,
	});
}

export function useCreateBankAccount() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorId,
			...payload
		}: { vendorId: string; [key: string]: any }) => {
			const { data } = await api.post(
				`/admin/vendors/${vendorId}/bank-accounts`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId, "bank-accounts"],
			});
		},
	});
}

export function useUpdateBankAccount() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorId,
			accId,
			...payload
		}: { vendorId: string; accId: string; [key: string]: any }) => {
			const { data } = await api.patch(
				`/admin/vendors/${vendorId}/bank-accounts/${accId}`,
				payload,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId, "bank-accounts"],
			});
		},
	});
}

export function useSetPrimaryBankAccount() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorId,
			accId,
		}: { vendorId: string; accId: string }) => {
			const { data } = await api.patch(
				`/admin/vendors/${vendorId}/bank-accounts/${accId}/primary`,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId, "bank-accounts"],
			});
		},
	});
}

export function useDeleteBankAccount() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorId,
			accId,
		}: { vendorId: string; accId: string }) => {
			const { data } = await api.delete(
				`/admin/vendors/${vendorId}/bank-accounts/${accId}`,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId, "bank-accounts"],
			});
		},
	});
}

export function useResetVendorPassword() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ vendorId }: { vendorId: string }) => {
			const { data } = await api.post(
				`/admin/auth/vendors/${vendorId}/reset-password`,
			);
			return data.data;
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId],
			});
			queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
		},
	});
}

export function useSetVendorPasswordDirectly() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ vendorId }: { vendorId: string }) => {
			const { data } = await api.post(
				`/admin/auth/vendors/${vendorId}/set-password`,
			);
			return data.data as { vendor_email: string; temporary_password: string };
		},
		onSuccess: (_data, { vendorId }) => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "vendors", vendorId],
			});
			queryClient.invalidateQueries({ queryKey: ["admin", "audit-log"] });
		},
	});
}

export async function fetchKycSignedUrl(s3Key: string): Promise<string> {
	const encoded = encodeURIComponent(s3Key);
	const { data } = await api.get(`/media/kyc/${encoded}/signed-url`);
	// The /media/* routes return data unwrapped (no { statusCode, data } envelope).
	return data.url;
}
