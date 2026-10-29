import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

interface OrderFilters {
	status?: string;
	vendor_id?: string;
	date_from?: string;
	date_to?: string;
	page?: number;
	limit?: number;
}

export function useAllOrders(filters: OrderFilters = {}) {
	return useQuery({
		queryKey: ["admin", "orders", filters],
		queryFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.status && filters.status !== "__all__")
				params.status = filters.status;
			if (filters.vendor_id && filters.vendor_id !== "__all__")
				params.vendor_id = filters.vendor_id;
			if (filters.date_from) params.date_from = filters.date_from;
			if (filters.date_to) params.date_to = filters.date_to;
			if (filters.page != null) params.page = filters.page;
			if (filters.limit != null) params.limit = filters.limit;
			const { data } = await api.get("/admin/orders", { params });
			return data.data;
		},
	});
}

export function useOrder(id: string) {
	return useQuery({
		queryKey: ["admin", "orders", id],
		queryFn: async () => {
			const { data } = await api.get(`/admin/orders/${id}`);
			return data.data;
		},
		enabled: !!id,
	});
}

export function useExportOrdersCsv(filters: OrderFilters = {}) {
	return useMutation({
		mutationFn: async () => {
			const params: Record<string, string | number> = {};
			if (filters.status && filters.status !== "__all__")
				params.status = filters.status;
			if (filters.vendor_id && filters.vendor_id !== "__all__")
				params.vendor_id = filters.vendor_id;
			if (filters.date_from) params.date_from = filters.date_from;
			if (filters.date_to) params.date_to = filters.date_to;
			const response = await api.get("/admin/orders/export", {
				params,
				responseType: "blob",
			});
			return response.data as Blob;
		},
	});
}

export function useUpdateShipmentStatus() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			orderId,
			shipmentId,
			status,
			reason,
		}: {
			orderId: string;
			shipmentId: string;
			status: string;
			reason: string;
		}) => {
			const { data } = await api.patch(
				`/admin/shipments/${shipmentId}/status`,
				{ status, reason },
			);
			return data.data;
		},
		onSuccess: (_data, { orderId }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "orders", orderId] });
		},
	});
}

export function useCancelAdminOrder() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			orderId,
			reason,
			refund,
			cancelFulfillment,
		}: {
			orderId: string;
			reason: string;
			refund: boolean;
			cancelFulfillment: boolean;
		}) => {
			const { data } = await api.post(`/admin/orders/${orderId}/cancel`, {
				reason,
				refund,
				cancel_fulfillment: cancelFulfillment,
			});
			return data.data;
		},
		onSuccess: (_data, { orderId }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "orders", orderId] });
			queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
		},
	});
}

export function useCancelAdminOrderItems() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			orderId,
			reason,
			items,
		}: {
			orderId: string;
			reason: string;
			items: Array<{ order_item_id: string; quantity: number }>;
		}) => {
			const { data } = await api.post(
				`/admin/orders/${orderId}/cancel-items`,
				{ reason, items },
			);
			return data.data;
		},
		onSuccess: (_data, { orderId }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "orders", orderId] });
			queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
		},
	});
}

/**
 * Admin transition for any vendor sub-order. Used to mark a vendor order
 * delivered (or any other state) when the carrier integration isn't
 * doing it for us — e.g. COD orders that have no shipment record. Backed
 * by PATCH /admin/vendor-orders/:id/status which calls
 * transitionVendorOrder with role="admin", picking up the state machine's
 * admin-bypass for the cancelled and delivered targets.
 */
export function useUpdateVendorOrderStatus() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorOrderId,
			status,
			reason,
		}: {
			orderId: string;
			vendorOrderId: string;
			status: string;
			reason?: string;
		}) => {
			const { data } = await api.patch(
				`/admin/vendor-orders/${vendorOrderId}/status`,
				{
					status,
					...(reason ? { reason } : {}),
				},
			);
			return data.data;
		},
		onSuccess: (_data, { orderId }) => {
			queryClient.invalidateQueries({ queryKey: ["admin", "orders", orderId] });
		},
	});
}

/**
 * Re-trigger carrier shipment booking for a vendor sub-order whose
 * automatic booking failed. The backend validates preconditions
 * (confirmed status, no existing shipment, usable carrier account) and
 * enqueues the booking job, so the shipment appears shortly after —
 * the order query is re-fetched after a delay to pick it up.
 */
export function useRetryShipmentBooking() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			vendorOrderId,
		}: {
			orderId: string;
			vendorOrderId: string;
		}) => {
			const { data } = await api.post(
				`/admin/vendor-orders/${vendorOrderId}/retry-shipment`,
			);
			return data.data;
		},
		onSuccess: (_data, { orderId }) => {
			const invalidate = () =>
				queryClient.invalidateQueries({
					queryKey: ["admin", "orders", orderId],
				});
			invalidate();
			// The booking runs on a queue; poll once after it has had time to book.
			setTimeout(invalidate, 8000);
		},
	});
}

export function useShipmentHistory(shipmentId: string | null) {
	return useQuery({
		queryKey: ["admin", "shipments", shipmentId, "history"],
		queryFn: async () => {
			const { data } = await api.get(`/admin/shipments/${shipmentId}/history`);
			return data.data;
		},
		enabled: !!shipmentId,
	});
}

export function useShipmentEvents(shipmentId: string | null) {
	return useQuery({
		queryKey: ["admin", "shipments", shipmentId, "events"],
		queryFn: async () => {
			const { data } = await api.get(`/admin/shipments/${shipmentId}/events`);
			return data.data;
		},
		enabled: !!shipmentId,
	});
}
