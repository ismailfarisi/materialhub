import { api } from "@/lib/api";
import type {
	Approval,
	ApprovalStatus,
	BusinessAccount,
	BusinessInput,
	BusinessMe,
	BusinessRole,
	CreditAccount,
	InvoiceRow,
	Member,
	NetTerms,
	Paged,
} from "@/lib/business/types";
import { useAuthStore } from "@/stores/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Business accounts, approvals and invoices: docs/business/business-accounts.md.
 * Every response is the usual `{ statusCode, data, timestamp }` envelope.
 */

export const businessKeys = {
	me: ["business", "me"] as const,
	members: ["business", "members"] as const,
	approvals: (status: string) => ["business", "approvals", status] as const,
	invoices: (params: object) => ["business", "invoices", params] as const,
};

export function useBusiness(enabled = true) {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	return useQuery({
		queryKey: businessKeys.me,
		queryFn: async (): Promise<BusinessMe> => {
			const { data } = await api.get("/auth/me/business");
			const d = data.data ?? {};
			return {
				account: d.account ?? null,
				membership: d.membership ?? null,
				credit: d.credit ?? null,
				invites: d.invites ?? [],
			};
		},
		enabled: isAuthenticated && enabled,
		staleTime: 30_000,
	});
}

function useInvalidateBusiness() {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: ["business"] });
}

export function useCreateBusiness() {
	const invalidate = useInvalidateBusiness();
	return useMutation({
		mutationFn: async (input: BusinessInput): Promise<BusinessAccount> => {
			const { data } = await api.post("/auth/me/business", input);
			return data.data;
		},
		onSuccess: invalidate,
	});
}

export function useUpdateBusiness() {
	const invalidate = useInvalidateBusiness();
	return useMutation({
		mutationFn: async (
			input: Partial<BusinessInput> & {
				approval_threshold_fils?: number | null;
			},
		): Promise<BusinessAccount> => {
			const { data } = await api.patch("/auth/me/business", input);
			return data.data;
		},
		onSuccess: invalidate,
	});
}

export function useMembers(enabled = true) {
	return useQuery({
		queryKey: businessKeys.members,
		queryFn: async (): Promise<Member[]> => {
			const { data } = await api.get("/auth/me/business/members");
			return data.data ?? [];
		},
		enabled,
	});
}

export function useInviteMember() {
	const invalidate = useInvalidateBusiness();
	return useMutation({
		mutationFn: async (body: {
			email: string;
			role: BusinessRole;
		}): Promise<Member> => {
			const { data } = await api.post("/auth/me/business/members", body);
			return data.data;
		},
		onSuccess: invalidate,
	});
}

export function useUpdateMemberRole() {
	const invalidate = useInvalidateBusiness();
	return useMutation({
		mutationFn: async ({
			id,
			role,
		}: { id: string; role: BusinessRole }): Promise<Member> => {
			const { data } = await api.patch(`/auth/me/business/members/${id}`, {
				role,
			});
			return data.data;
		},
		onSuccess: invalidate,
	});
}

export function useRemoveMember() {
	const invalidate = useInvalidateBusiness();
	return useMutation({
		mutationFn: async (id: string) => {
			await api.delete(`/auth/me/business/members/${id}`);
		},
		onSuccess: invalidate,
	});
}

export function useRespondToInvite() {
	const invalidate = useInvalidateBusiness();
	return useMutation({
		mutationFn: async ({
			id,
			action,
		}: { id: string; action: "accept" | "decline" }) => {
			const { data } = await api.post(
				`/auth/me/business/invites/${id}/${action}`,
				{},
			);
			return data.data;
		},
		onSuccess: invalidate,
	});
}

export function useApplyNetTerms() {
	const invalidate = useInvalidateBusiness();
	return useMutation({
		mutationFn: async (body: {
			terms: NetTerms;
			requested_limit_fils: number;
			note?: string;
		}): Promise<CreditAccount> => {
			const { data } = await api.post("/auth/me/business/net-terms", body);
			return data.data;
		},
		onSuccess: invalidate,
	});
}

/**
 * Licence upload: presign, PUT the file to the signed URL, return the key to
 * send as `trade_licence_document_key`.
 */
export function useUploadLicence() {
	return useMutation({
		mutationFn: async (file: File): Promise<string> => {
			const { data } = await api.post("/media/presign", {
				asset_type: "business_licence",
				filename: file.name,
				content_type: file.type,
			});
			const { uploadUrl, key } = (data.data ?? data) as {
				uploadUrl: string;
				key: string;
			};
			const res = await fetch(uploadUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});
			if (!res.ok) throw new Error(`Upload failed (${res.status})`);
			return key;
		},
	});
}

/* ---------------------------- approvals ---------------------------- */

/** `status` "all" sends no filter (contract shows `?status=pending`; other values assumed). */
export function useApprovals(status: ApprovalStatus | "all", enabled = true) {
	return useQuery({
		queryKey: businessKeys.approvals(status),
		queryFn: async (): Promise<Approval[]> => {
			const { data } = await api.get("/checkout/approvals", {
				params: status === "all" ? undefined : { status },
			});
			const d = data.data;
			return (Array.isArray(d) ? d : d?.items) ?? [];
		},
		enabled,
	});
}

export function useRequestApproval() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: { note?: string }): Promise<Approval> => {
			const { data } = await api.post("/checkout/approvals", body);
			return data.data;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["business", "approvals"] }),
	});
}

export function useDecideApproval() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			action,
			note,
		}: {
			id: string;
			action: "approve" | "reject" | "cancel";
			note?: string;
		}): Promise<Approval> => {
			const { data } = await api.post(
				`/checkout/approvals/${id}/${action}`,
				action === "cancel" ? {} : { note },
			);
			return data.data;
		},
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["business", "approvals"] }),
	});
}

/* ----------------------------- invoices ---------------------------- */

export type InvoiceFilter = "all" | "unpaid" | "paid" | "overdue";

export function useInvoices(params: {
	page: number;
	limit: number;
	status: InvoiceFilter;
}) {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	return useQuery({
		queryKey: businessKeys.invoices(params),
		queryFn: async (): Promise<Paged<InvoiceRow>> => {
			const { data } = await api.get("/invoices", {
				params: {
					page: params.page,
					limit: params.limit,
					...(params.status === "all" ? {} : { status: params.status }),
				},
			});
			const d = data.data ?? {};
			return {
				items: d.items ?? [],
				total: d.total ?? 0,
				page: d.page ?? params.page,
				limit: d.limit ?? params.limit,
			};
		},
		enabled: isAuthenticated,
		placeholderData: (prev) => prev,
	});
}

/** Signed PDF URL for a tax invoice. */
export async function fetchInvoicePdfUrl(id: string): Promise<string> {
	const { data } = await api.get(`/invoices/${id}/pdf`);
	return (data.data ?? data).url;
}

/** UBL 2.1 XML as a Blob (sent as an attachment). */
export async function fetchInvoiceXml(id: string): Promise<Blob> {
	const { data } = await api.get(`/invoices/${id}/xml`, {
		responseType: "blob",
	});
	return data as Blob;
}

/* ----------------------------- checkout ---------------------------- */

export function useNetTermsCheckout() {
	return useMutation({
		mutationFn: async (body: {
			order_id: string;
		}): Promise<{
			status: "confirmed";
			payment_due_at: string;
			terms: NetTerms;
			order_id: string;
		}> => {
			const { data } = await api.post("/checkout/net-terms", body);
			return data.data;
		},
	});
}
