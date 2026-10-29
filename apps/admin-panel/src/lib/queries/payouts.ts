import type { PayoutRail } from "@/components/payouts/payout-actions.helpers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface AdminPayoutFilters {
	vendorId?: string;
	status?: string;
	periodFrom?: string;
	periodTo?: string;
	reference?: string;
	minNet?: number;
	maxNet?: number;
	page?: number;
	limit?: number;
}

export interface AdminPayoutListRow {
	id: string;
	vendor_id: string;
	/**
	 * Present on GET /admin/payouts (listForAdmin maps it on) but NOT on
	 * GET /admin/payouts/:id, which returns the raw entity. Optional here so
	 * the detail page is forced to go through `payoutVendorName()` instead of
	 * rendering `undefined`.
	 */
	vendor_name?: string;
	/** Only the detail endpoint loads the relation. */
	vendor?: {
		business_name?: string | null;
		name?: string | null;
		stripe_account_id?: string | null;
	} | null;
	payout_reference: string;
	period_start: string;
	period_end: string;
	gross_amount: number;
	commission_total: number;
	adjustment_total: number;
	/** Informational only — NOT deducted. See buildPayoutBreakdown. */
	carrier_cost_total: number;
	/** The shipping figure actually deducted from the vendor. */
	shipping_contribution_total: number;
	net_amount: number;
	status: "pending" | "processing" | "paid" | "failed";
	/**
	 * NULL while the payout is still a pending draft — the rail is not chosen
	 * until an admin pays it via useApproveDraft.
	 */
	payout_rail: PayoutRail | null;
	gateway_reference: string | null;
	processed_at: string | null;
	notes: string | null;
	created_at: string;
}

export interface AdminPayoutSummary {
	total_pending_fils: number;
	paid_this_month_fils: number;
	processing_count: number;
	failed_count: number;
}

export interface PayoutEstimate {
	gross_amount: number;
	vat_total: number;
	commission_total: number;
	carrier_cost_total: number;
	net_amount: number;
	pending_count: number;
	/**
	 * The one precondition `createDraft` refuses on that the Generate dialog
	 * cannot otherwise see. Optional because an older API build (or a cached
	 * response from one) omits it, and a missing field must not be read as
	 * "blocked" — see the `=== false` check in GeneratePayoutDialog.
	 */
	has_primary_bank_account?: boolean;
}

export interface AuditLogRow {
	id: string;
	action: string;
	actor_id: string | null;
	actor_role: string;
	entity_type: string;
	entity_id: string | null;
	changes: Record<string, { old: unknown; new: unknown }> | null;
	metadata: Record<string, unknown> | null;
	created_at: string;
}

export interface PayoutAdjustmentRow {
	id: string;
	vendor_id: string;
	/** Signed, fils. Negative = clawback from the vendor. */
	amount_fils: number;
	reason: string;
	source_type: string;
	source_id: string | null;
	settled_payout_id: string | null;
	created_by: string | null;
	created_at: string;
}

const root = ["admin", "payouts"] as const;

export function useAdminPayouts(filters: AdminPayoutFilters = {}) {
	return useQuery({
		queryKey: [...root, "list", filters],
		queryFn: async () => {
			const params: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(filters)) {
				if (v !== undefined && v !== "" && v !== null) params[k] = v;
			}
			const { data } = await api.get("/admin/payouts", { params });
			return {
				items: data.data as AdminPayoutListRow[],
				total: data.total as number,
			};
		},
	});
}

export function useAdminPayoutSummary() {
	return useQuery({
		queryKey: [...root, "summary"],
		queryFn: async () => {
			const { data } = await api.get("/admin/payouts/summary");
			return data.data as AdminPayoutSummary;
		},
	});
}

export function useAdminPayoutEstimate(vendorId: string | undefined) {
	return useQuery({
		queryKey: [...root, "estimate", vendorId],
		queryFn: async () => {
			const { data } = await api.get("/admin/payouts/estimate", {
				params: { vendorId },
			});
			return data.data as PayoutEstimate;
		},
		enabled: !!vendorId,
	});
}

export function useAdminPayout(id: string) {
	return useQuery({
		queryKey: [...root, "detail", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/payouts/${id}`);
			return data.data as AdminPayoutListRow;
		},
		enabled: !!id,
	});
}

export function useAdminPayoutCommissions(
	id: string,
	page: number,
	limit = 20,
) {
	return useQuery({
		queryKey: [...root, "commissions", id, page, limit],
		queryFn: async () => {
			const { data } = await api.get(`/admin/payouts/${id}/commissions`, {
				params: { page, limit },
			});
			return { items: data.data as unknown[], total: data.total as number };
		},
		enabled: !!id,
	});
}

export function useAdminPayoutTimeline(id: string) {
	return useQuery({
		queryKey: [...root, "timeline", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/payouts/${id}/timeline`);
			return data.data as AuditLogRow[];
		},
		enabled: !!id,
	});
}

export function useAdminPayoutAdjustments(id: string) {
	return useQuery({
		queryKey: [...root, "adjustments", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/payouts/${id}/adjustments`);
			return data.data as PayoutAdjustmentRow[];
		},
		enabled: !!id,
	});
}

function invalidate(qc: ReturnType<typeof useQueryClient>, id?: string) {
	qc.invalidateQueries({ queryKey: [...root] });
	if (id) {
		qc.invalidateQueries({ queryKey: [...root, "detail", id] });
		qc.invalidateQueries({ queryKey: [...root, "timeline", id] });
		qc.invalidateQueries({ queryKey: [...root, "commissions", id] });
		qc.invalidateQueries({ queryKey: [...root, "adjustments", id] });
	}
}

export function useGeneratePayout() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: {
			vendorId: string;
			periodStart: string;
			periodEnd: string;
			/**
			 * Overrides the vendor's `minimum_payout` floor. Without it a draft
			 * whose net is below the minimum is rejected with
			 * PAYOUT_BELOW_MINIMUM and the operator has no way to proceed.
			 */
			force?: boolean;
		}) => {
			const { data } = await api.post("/admin/payouts/generate", body);
			return data.data as { jobId: string; estimate: PayoutEstimate };
		},
		onSuccess: () => invalidate(qc),
	});
}

export function useRetryPayout() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.post(`/admin/payouts/${id}/retry`);
			return data.data as { jobId: string };
		},
		onSuccess: (_d, id) => invalidate(qc, id),
	});
}

export function useUpdatePayoutStatus() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			id: string;
			status: "paid" | "failed";
			notes?: string;
			/**
			 * Required by the server when payout_rail === "manual_bank_transfer"
			 * and status === "paid" (400 otherwise). Written into
			 * gateway_reference. On the Stripe rail a supplied reference is
			 * ignored server-side and cannot overwrite the existing tr_... id.
			 */
			reference?: string;
		}) => {
			const { data } = await api.patch(`/admin/payouts/${input.id}/status`, {
				status: input.status,
				notes: input.notes,
				reference: input.reference,
			});
			return data.data as AdminPayoutListRow;
		},
		onSuccess: (_d, { id }) => invalidate(qc, id),
	});
}

/**
 * Adjusts a PENDING draft's amount in place, writing a ledger row settled
 * against this payout. Distinct from useCreateAdjustment, which is
 * vendor-scoped and lands in the vendor's NEXT draft.
 */
export function useAdjustDraft() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: { id: string; amountFils: number; reason: string }) => {
			const { data } = await api.post(`/admin/payouts/${input.id}/adjustments`, {
				amountFils: input.amountFils,
				reason: input.reason,
			});
			return data.data as AdminPayoutListRow;
		},
		onSuccess: (_d, { id }) => invalidate(qc, id),
	});
}

export function useAddPayoutNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: { id: string; note: string }) => {
			const { data } = await api.post(`/admin/payouts/${input.id}/notes`, {
				note: input.note,
			});
			return data.data as AdminPayoutListRow;
		},
		onSuccess: (_d, { id }) => invalidate(qc, id),
	});
}

/**
 * Pays a draft on the chosen rail. `stripe_connect` queues a real transfer;
 * `manual_bank_transfer` only moves the payout to `processing` and waits for
 * the operator to record a bank reference via Mark Paid.
 */
export function useApproveDraft() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, rail }: { id: string; rail: PayoutRail }) => {
			const { data } = await api.post(`/admin/payouts/${id}/approve`, { rail });
			return data.data as { jobId: string | null; rail: PayoutRail };
		},
		onSuccess: (_d, { id }) => invalidate(qc, id),
	});
}

/**
 * Returns the vendor's unmasked bank details so an operator can make the
 * transfer. super_admin only; every call is audit-logged server-side.
 *
 * `account_deleted` is true when the vendor has since soft-deleted the bank
 * account this payout snapshotted — the operator is about to wire money to
 * an account the vendor removed, and needs to see that before Mark Paid, not
 * discover it from a bounced transfer.
 */
export function useRevealBank() {
	return useMutation({
		mutationFn: async (id: string) => {
			const { data } = await api.post(`/admin/payouts/${id}/reveal-bank`);
			return data.data as {
				account_holder_name: string;
				bank_name: string;
				account_number: string;
				iban: string | null;
				swift_code: string | null;
				currency: string;
				account_deleted: boolean;
			};
		},
	});
}

/**
 * Downloads the vendor payout statement PDF.
 *
 * Goes through axios rather than a plain `<a href>` because the API is on a
 * different origin and the bearer token lives in memory, not a cookie the
 * browser would attach — a bare link would hit the endpoint unauthenticated
 * and download a 401 JSON body named `.pdf`.
 *
 * Nothing here emails the vendor: the file lands in the operator's downloads
 * and they forward it themselves. Every call writes a
 * `payout.statement_downloaded` audit row server-side.
 */
export function useDownloadPayoutStatement() {
	return useMutation({
		mutationFn: async ({
			id,
			reference,
		}: {
			id: string;
			reference: string;
		}) => {
			const response = await api.get<Blob>(`/admin/payouts/${id}/statement`, {
				responseType: "blob",
			});
			// Content-Disposition is only readable cross-origin when the API
			// exposes it, so the reference we already have is the reliable
			// source for the filename; the header is a bonus when present.
			const disposition = response.headers?.["content-disposition"] as
				| string
				| undefined;
			const filename =
				disposition?.match(/filename="?([^";]+)"?/i)?.[1] ??
				`payout-statement-${reference}.pdf`;
			const blobUrl = URL.createObjectURL(response.data);
			const a = document.createElement("a");
			a.href = blobUrl;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(blobUrl);
		},
	});
}

/**
 * Releases the draft's claimed commissions and adjustments back into the
 * payable pool and soft-deletes the draft. Only valid while `pending`.
 */
export function useRejectDraft() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
			const { data } = await api.post(`/admin/payouts/${id}/reject`, { reason });
			return data.data as { ok: boolean };
		},
		onSuccess: (_d, { id }) => invalidate(qc, id),
	});
}

/**
 * Releases a FAILED payout's claimed commissions, adjustments and licence
 * holds back into the payable pool and soft-deletes the payout.
 *
 * Permitted by the backend only when `status === 'failed'` AND
 * `gateway_reference IS NULL` — i.e. only when no transfer demonstrably left
 * the platform. Anything else returns 409 with code PAYOUT_NOT_VOIDABLE.
 *
 * Without this, `failed` is an absorbing state: `payout_id` is nulled in
 * exactly one place (releaseClaims) which no failed payout can reach, so every
 * commission the failed draft claimed is unpayable forever.
 */
export function useVoidPayout() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
			const { data } = await api.post(`/admin/payouts/${id}/void`, { reason });
			return data.data as { ok: boolean };
		},
		onSuccess: (_d, { id }) => invalidate(qc, id),
	});
}

/**
 * A row from GET /admin/payout-adjustments (vendor-scoped, paginated list —
 * distinct from PayoutAdjustmentRow above, which comes from the per-payout
 * GET /admin/payouts/:id/adjustments and lacks the pagination this endpoint
 * has). Same underlying vendor_payout_adjustments table, different query shape.
 */
export interface AdjustmentRow {
	id: string;
	vendor_id: string;
	/** Signed, fils. Negative = clawback from the vendor. */
	amount_fils: number;
	reason: string;
	source_type: string;
	source_id: string | null;
	settled_payout_id: string | null;
	created_at: string;
}

export function useVendorAdjustments(
	vendorId: string | undefined,
	opts: { unsettledOnly?: boolean; page?: number; limit?: number } = {},
) {
	return useQuery({
		queryKey: [...root, "adjustments", vendorId, opts],
		enabled: Boolean(vendorId),
		queryFn: async () => {
			const { data } = await api.get("/admin/payout-adjustments", {
				params: { vendorId, ...opts },
			});
			return { items: data.data as AdjustmentRow[], total: data.total as number };
		},
	});
}

export function useCreateAdjustment() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			vendorId: string;
			amountFils: number;
			reason: string;
		}) => {
			const { data } = await api.post("/admin/payout-adjustments", input);
			return data.data as AdjustmentRow;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: root }),
	});
}
