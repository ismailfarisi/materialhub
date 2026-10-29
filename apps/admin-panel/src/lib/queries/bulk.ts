import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export type BulkJobStatus =
	| "pending_upload"
	| "queued"
	| "running"
	| "completed"
	| "completed_with_errors"
	| "failed"
	| "cancelled";

export interface BulkJobSummary {
	id: string;
	jobType:
		| "inventory_update"
		| "catalog_import"
		| "flash_deal_import"
		| "flash_deal_delete";
	status: BulkJobStatus;
	vendorId: string | null;
	fileName: string;
	totalRows: number | null;
	processedRows: number;
	succeededRows: number;
	skippedRows: number;
	imagesTotal: number;
	imagesProcessed: number;
	imagesFailed: number;
	createdAt: string;
	startedAt: string | null;
	completedAt: string | null;
	revertedAt: string | null;
	revertedByUserId: string | null;
}

export function useBulkJobs(
	filters: { jobType?: string; status?: string; vendorId?: string } = {},
) {
	return useQuery({
		queryKey: ["bulk-jobs", filters],
		queryFn: async () => {
			const { data } = await api.get<{
				items: BulkJobSummary[];
				total: number;
			}>("/bulk/jobs", {
				params: filters,
			});
			return data;
		},
		refetchInterval: (q) => {
			const data = q.state.data;
			const running = data?.items.some(
				(j) => j.status === "queued" || j.status === "running",
			);
			return running ? 3000 : false;
		},
	});
}

export function useBulkJob(id: string | null) {
	return useQuery({
		queryKey: ["bulk-jobs", id],
		enabled: !!id,
		queryFn: async () => {
			const { data } = await api.get<BulkJobSummary>(`/bulk/jobs/${id}`);
			return data;
		},
		refetchInterval: (q) => {
			const s = q.state.data?.status;
			return s === "queued" || s === "running" ? 3000 : false;
		},
	});
}

export function useBulkJobChanges(id: string | null, page = 1, pageSize = 50) {
	return useQuery({
		queryKey: ["bulk-jobs", id, "changes", page, pageSize],
		enabled: !!id,
		queryFn: async () => {
			const { data } = await api.get(`/bulk/jobs/${id}/changes`, {
				params: { page, pageSize },
			});
			return data as {
				items: Array<{
					rowNumber: number;
					entityType: string;
					field: string;
					oldValue: unknown;
					newValue: unknown;
					at: string;
				}>;
				total: number;
			};
		},
	});
}

export function useInitiateBulkUpload() {
	return useMutation({
		mutationFn: async (args: {
			jobType: string;
			fileName: string;
			fileSizeBytes: number;
			fileFormat: "csv" | "xlsx";
			targetVendorId?: string | null;
			mode?: "upsert" | "update";
		}) => {
			const { data } = await api.post<{
				jobId: string;
				presignedUrl: string;
				s3Key: string;
			}>("/bulk/uploads/initiate", args);
			return data;
		},
	});
}

export async function uploadToPresigned(
	url: string,
	file: File,
): Promise<void> {
	const res = await fetch(url, {
		method: "PUT",
		body: file,
		headers: { "Content-Type": file.type },
	});
	if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}

export function useStartBulkJob() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (jobId: string) => {
			await api.post(`/bulk/jobs/${jobId}/start`);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["bulk-jobs"] }),
	});
}

export function useCancelBulkJob() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (jobId: string) => {
			await api.post(`/bulk/jobs/${jobId}/cancel`);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["bulk-jobs"] }),
	});
}

export function useRevertBulkJob() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (jobId: string) => {
			const { data } = await api.post<{
				ok: boolean;
				revertedCount: number;
				skippedAlreadyDeletedCount: number;
			}>(`/bulk/jobs/${jobId}/revert`);
			return data;
		},
		onSuccess: (_data, jobId) => {
			qc.invalidateQueries({ queryKey: ["bulk-jobs"] });
			qc.invalidateQueries({ queryKey: ["bulk-jobs", jobId] });
		},
	});
}

export async function fetchErrorReportUrl(
	jobId: string,
): Promise<string | null> {
	const { data } = await api.get<{ url: string } | { error: string }>(
		`/bulk/jobs/${jobId}/error-report`,
	);
	return "url" in data ? data.url : null;
}

export async function downloadTemplate(
	jobType: string,
	format: "csv" | "xlsx",
	options: { categorySlugs?: string[] } = {},
): Promise<void> {
	const response = await api.get<Blob>(`/bulk/templates/${jobType}`, {
		params: {
			format,
			categorySlugs: options.categorySlugs?.join(",") || undefined,
		},
		responseType: "blob",
	});
	const disposition = response.headers?.["content-disposition"] as
		| string
		| undefined;
	const match = disposition?.match(/filename="?([^";]+)"?/i);
	const filename = match?.[1] ?? `${jobType}.${format}`;
	const blobUrl = URL.createObjectURL(response.data);
	const a = document.createElement("a");
	a.href = blobUrl;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(blobUrl);
}

export type ProductExportFormat = "csv" | "xlsx";
export type ProductExportPreset =
	| "catalog_overview"
	| "pricing"
	| "inventory"
	| "media_health"
	| "seo"
	| "custom";

export interface ProductExportJobSummary {
	id: string;
	jobType: string;
	status: "queued" | "running" | "completed" | "failed" | "cancelled";
	vendorId: string | null;
	format: ProductExportFormat;
	preset: ProductExportPreset;
	fileName: string;
	fileSizeBytes: number | null;
	rowCounts: Record<string, number> | null;
	errorMessage: string | null;
	expiresAt: string;
	createdAt: string;
	startedAt: string | null;
	completedAt: string | null;
}

export interface ProductExportMetadata {
	presets: Array<{
		key: ProductExportPreset;
		label: string;
		defaultFieldGroups: string[];
	}>;
	fieldGroups: Array<{ key: string; label: string; defaultFields: string[] }>;
	fields: Array<{
		key: string;
		label: string;
		group: string;
		sheet: string;
		csvMode: string;
	}>;
	filters: Record<string, boolean>;
}

export function useProductExportMetadata() {
	return useQuery({
		queryKey: ["product-export", "metadata"],
		queryFn: async () => {
			const { data } = await api.get<ProductExportMetadata>(
				"/bulk/exports/products/fields",
			);
			return data;
		},
	});
}

export function useProductExportJobs(filters: { vendorId?: string } = {}) {
	return useQuery({
		queryKey: ["product-export", "jobs", filters],
		queryFn: async () => {
			const { data } = await api.get<{
				items: ProductExportJobSummary[];
				total: number;
				page: number;
				pageSize: number;
			}>("/bulk/exports", { params: filters });
			return data;
		},
		refetchInterval: (q) => {
			const running = q.state.data?.items.some(
				(job) => job.status === "queued" || job.status === "running",
			);
			return running ? 3000 : false;
		},
	});
}

export function useCreateProductExport() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: {
			format: ProductExportFormat;
			preset: ProductExportPreset;
			fieldGroups: string[];
			fields?: string[];
			filters?: Record<string, string | undefined>;
		}) => {
			const { data } = await api.post<ProductExportJobSummary>(
				"/bulk/exports/products",
				body,
			);
			return data;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["product-export", "jobs"] }),
	});
}

export async function fetchProductExportDownloadUrl(
	jobId: string,
): Promise<string | null> {
	const { data } = await api.get<{ url: string } | { error: string }>(
		`/bulk/exports/${jobId}/download`,
	);
	return "url" in data ? data.url : null;
}
