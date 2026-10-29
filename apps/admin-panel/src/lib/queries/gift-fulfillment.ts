import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FulfillmentStatus =
	| "awaiting_items"
	| "partially_received"
	| "ready_to_assemble"
	| "assembling"
	| "packed"
	| "shipped"
	| "delivered"
	| "cancelled"
	| "exception";

export interface GiftFulfillmentOrder {
	id: string;
	order_id: string;
	box_name_snapshot: string;
	recipient_name: string | null;
	gift_message: string | null;
	fulfillment_status: FulfillmentStatus;
	hub_warehouse_id: string | null;
	assembled_at: string | null;
	dispatched_at: string | null;
	delivered_at: string | null;
	outbound_carrier: string | null;
	outbound_tracking_number: string | null;
	outbound_tracking_url: string | null;
	created_at: string;
}

export interface VendorParcelItem {
	product_name: string;
	variant_name: string | null;
	quantity: number;
}

export interface VendorParcel {
	id: string;
	vendor_id: string;
	vendor_order_number: string;
	status: string;
	received_at_hub_at: string | null;
	vendor?: { name: string };
	items?: VendorParcelItem[];
}

export interface GiftFulfillmentDetail {
	giftOrder: GiftFulfillmentOrder;
	vendorOrders: VendorParcel[];
}

export interface PackingSlipItem {
	product_name: string;
	variant_name: string | null;
	quantity: number;
	vendor_name: string | null;
}

export interface PackingSlip {
	gift_order_id: string;
	box_name: string;
	recipient_name: string | null;
	gift_message: string | null;
	fulfillment_status: FulfillmentStatus;
	items: PackingSlipItem[];
}

export interface GiftFulfillmentQueue {
	items: GiftFulfillmentOrder[];
	total: number;
	page: number;
	perPage: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const BASE = "/admin/gift-fulfillment";
const QUEUE_KEY = ["admin", "gift-fulfillment", "queue"] as const;
const DETAIL_KEY = ["admin", "gift-fulfillment", "detail"] as const;
const SLIP_KEY = ["admin", "gift-fulfillment", "packing-slip"] as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useGiftFulfillmentQueue(
	status?: FulfillmentStatus,
	page = 1,
	perPage = 20,
) {
	return useQuery({
		queryKey: [...QUEUE_KEY, status ?? "all", page, perPage],
		queryFn: async (): Promise<GiftFulfillmentQueue> => {
			const params: Record<string, string | number> = { page, perPage };
			if (status) params.status = status;
			const { data } = await api.get(BASE, { params });
			return data.data as GiftFulfillmentQueue;
		},
	});
}

export function useGiftFulfillmentDetail(id: string | null | undefined) {
	return useQuery({
		queryKey: [...DETAIL_KEY, id],
		queryFn: async (): Promise<GiftFulfillmentDetail> => {
			const { data } = await api.get(`${BASE}/${id}`);
			return data.data as GiftFulfillmentDetail;
		},
		enabled: !!id,
	});
}

/** Fetched on demand (e.g. when the user clicks "Print packing slip"). */
export function usePackingSlip(id: string | null | undefined, enabled: boolean) {
	return useQuery({
		queryKey: [...SLIP_KEY, id],
		queryFn: async (): Promise<PackingSlip> => {
			const { data } = await api.get(`${BASE}/${id}/packing-slip`);
			return data.data as PackingSlip;
		},
		enabled: !!id && enabled,
	});
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useInvalidateOnSuccess(id: string) {
	const qc = useQueryClient();
	return () => {
		qc.invalidateQueries({ queryKey: QUEUE_KEY });
		qc.invalidateQueries({ queryKey: [...DETAIL_KEY, id] });
	};
}

export function useMarkReceived(id: string) {
	const invalidate = useInvalidateOnSuccess(id);
	return useMutation({
		mutationFn: async (vendorOrderId: string) => {
			const { data } = await api.post(`${BASE}/${id}/receive`, {
				vendorOrderId,
			});
			return data.data as GiftFulfillmentDetail;
		},
		onSuccess: invalidate,
	});
}

export function useMarkAssembled(id: string) {
	const invalidate = useInvalidateOnSuccess(id);
	return useMutation({
		mutationFn: async (notes?: string) => {
			const { data } = await api.post(`${BASE}/${id}/assemble`, { notes });
			return data.data as GiftFulfillmentOrder;
		},
		onSuccess: invalidate,
	});
}

export interface DispatchInput {
	carrier: string;
	trackingNumber: string;
	trackingUrl?: string;
}

export function useDispatch(id: string) {
	const invalidate = useInvalidateOnSuccess(id);
	return useMutation({
		mutationFn: async (body: DispatchInput) => {
			const { data } = await api.post(`${BASE}/${id}/dispatch`, body);
			return data.data as GiftFulfillmentOrder;
		},
		onSuccess: invalidate,
	});
}

export function useMarkDelivered(id: string) {
	const invalidate = useInvalidateOnSuccess(id);
	return useMutation({
		mutationFn: async () => {
			const { data } = await api.post(`${BASE}/${id}/deliver`, {});
			return data.data as GiftFulfillmentOrder;
		},
		onSuccess: invalidate,
	});
}

export function useCancelGiftOrder(id: string) {
	const invalidate = useInvalidateOnSuccess(id);
	return useMutation({
		mutationFn: async (reason: string) => {
			const { data } = await api.post(`${BASE}/${id}/cancel`, { reason });
			return data.data as GiftFulfillmentOrder;
		},
		onSuccess: invalidate,
	});
}

// ---------------------------------------------------------------------------
// Status presentation helpers
// ---------------------------------------------------------------------------

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
	awaiting_items: "Awaiting items",
	partially_received: "Partially received",
	ready_to_assemble: "Ready to assemble",
	assembling: "Assembling",
	packed: "Packed",
	shipped: "Shipped",
	delivered: "Delivered",
	cancelled: "Cancelled",
	exception: "Exception",
};

export const FULFILLMENT_STATUS_CLASSES: Record<FulfillmentStatus, string> = {
	awaiting_items: "bg-amber-100 text-amber-700",
	partially_received: "bg-amber-100 text-amber-700",
	ready_to_assemble: "bg-blue-100 text-blue-700",
	assembling: "bg-blue-100 text-blue-700",
	packed: "bg-indigo-100 text-indigo-700",
	shipped: "bg-purple-100 text-purple-700",
	delivered: "bg-green-100 text-green-700",
	cancelled: "bg-gray-100 text-gray-600",
	exception: "bg-red-100 text-red-700",
};

/** Status options surfaced as queue filter tabs (in workflow order). */
export const QUEUE_FILTER_STATUSES: FulfillmentStatus[] = [
	"awaiting_items",
	"partially_received",
	"ready_to_assemble",
	"packed",
	"shipped",
	"delivered",
];
