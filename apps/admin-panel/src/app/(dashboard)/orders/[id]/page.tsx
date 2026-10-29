"use client";

import {
	useCancelAdminOrder,
	useCancelAdminOrderItems,
	useOrder,
	useRetryShipmentBooking,
	useShipmentEvents,
	useShipmentHistory,
	useUpdateShipmentStatus,
	useUpdateVendorOrderStatus,
} from "@/lib/queries/orders";
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
	Skeleton,
	StatusBadge,
	Textarea,
	toast,
} from "@materialhub/ui";
import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	FileText,
	Package,
	Truck,
	XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

interface OrderItem {
	id: string;
	product_name: string;
	quantity: number;
	unit_price: number;
	total_price: number;
	variant_label?: string;
	thumbnail_url?: string;
	refunded_quantity?: number;
	external_id?: string | null;
}

interface CancellationItem {
	order_item_id: string;
	vendor_order_id?: string;
	quantity: number;
	refund_amount: number;
}

interface CancellationRecord {
	id: string;
	reason: string;
	admin_id?: string;
	created_at: string;
	refund_amount: number;
	refund_method: string;
	gateway_refund_id?: string | null;
	status: string;
	items: CancellationItem[];
}

interface ShipmentData {
	id: string;
	tracking_number: string | null;
	carrier: string | null;
	status: string;
	shipped_at: string | null;
	delivered_at: string | null;
	tracking_url?: string | null;
	label_url?: string | null;
	pickup_code?: string | null;
}

interface VendorOrder {
	id: string;
	vendor_name: string;
	status: string;
	subtotal: number;
	items: OrderItem[];
	shipments?: ShipmentData[];
	booking_error?: string | null;
}

interface MasterOrder {
	id: string;
	order_number: string;
	status: string;
	total: number;
	subtotal: number;
	tax_amount: number;
	shipping_total: number;
	payment_method: string;
	created_at: string;
	customer_name: string;
	customer_email: string;
	customer_phone?: string;
	shipping_address?: Record<string, any>;
	payments?: { payment_method: string }[];
	vendor_orders: VendorOrder[];
	vendorOrders?: VendorOrder[];
	cancellations?: CancellationRecord[];
	[key: string]: any;
}

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
	pending: "Pending",
	picked_up: "Picked Up",
	in_transit: "In Transit",
	out_for_delivery: "Out for Delivery",
	delivered: "Delivered",
	cancelled: "Cancelled",
	failed_delivery: "Failed Delivery",
	returned: "Returned",
};

const ADMIN_NEXT_STATUSES: Record<string, string[]> = {
	pending: ["picked_up"],
	picked_up: ["in_transit"],
	in_transit: ["out_for_delivery", "delivered", "failed_delivery"],
	out_for_delivery: ["delivered", "failed_delivery"],
	failed_delivery: ["returned"],
};

const TERMINAL_SHIPMENT_STATUSES = new Set(["delivered", "cancelled", "returned"]);

const TERMINAL_MASTER_ORDER_STATUSES = new Set([
	"cancelled",
	"refunded",
	"delivered",
]);

// Vendor-order transitions admin can pick from in the dropdown. The
// backend state machine grants admin a bypass for `cancelled` and
// `delivered` from any state, so those are always available. The
// intermediate steps follow the regular happy path so admin can also
// move things forward step-by-step when needed.
const VENDOR_ORDER_NEXT_STATUSES_FOR_ADMIN: Record<string, string[]> = {
	confirmed: ["processing", "delivered", "cancelled"],
	processing: ["ready_to_ship", "delivered", "cancelled"],
	ready_to_ship: ["shipped", "delivered", "cancelled"],
	shipped: ["out_for_delivery", "delivered", "cancelled"],
	out_for_delivery: ["delivered", "cancelled"],
};
const TERMINAL_VENDOR_ORDER_STATUSES = new Set([
	"delivered",
	"cancelled",
	"refunded",
	"partially_refunded",
]);
// A vendor sub-order can only have its items partially cancelled before the
// carrier has picked anything up — mirrors the backend's pre-shipment guard
// in OrderItemCancellationService.
const PRE_SHIPMENT_VENDOR_ORDER_STATUSES = new Set([
	"confirmed",
	"processing",
	"ready_to_ship",
]);
const VENDOR_ORDER_STATUS_LABELS: Record<string, string> = {
	processing: "Processing",
	ready_to_ship: "Ready to Ship",
	shipped: "Shipped",
	out_for_delivery: "Out for Delivery",
	delivered: "Delivered",
	cancelled: "Cancelled",
};

function AdminVendorOrderStatusDialog({
	vo,
	orderId,
	open,
	onClose,
}: {
	vo: VendorOrder;
	orderId: string;
	open: boolean;
	onClose: () => void;
}) {
	const [status, setStatus] = useState("");
	const [reason, setReason] = useState("");
	const { mutate: updateStatus, isPending } = useUpdateVendorOrderStatus();

	const nextStatuses = VENDOR_ORDER_NEXT_STATUSES_FOR_ADMIN[vo.status] || [];

	function handleSubmit() {
		if (!status) return;
		updateStatus(
			{
				orderId,
				vendorOrderId: vo.id,
				status,
				reason: reason.trim() || undefined,
			},
			{
				onSuccess: () => {
					setStatus("");
					setReason("");
					onClose();
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Update Vendor Order Status (Admin)</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div>
						<p className="text-sm text-muted-foreground mb-1">
							Vendor: <span className="font-medium">{vo.vendor_name}</span>
						</p>
						<p className="text-sm text-muted-foreground">
							Current:{" "}
							<span className="font-medium capitalize">
								{vo.status?.replace(/_/g, " ")}
							</span>
						</p>
					</div>
					<div>
						<Label className="mb-1 block">New Status</Label>
						<Select value={status} onValueChange={setStatus}>
							<SelectTrigger>
								<SelectValue placeholder="Select status" />
							</SelectTrigger>
							<SelectContent>
								{nextStatuses.map((s) => (
									<SelectItem key={s} value={s}>
										{VENDOR_ORDER_STATUS_LABELS[s] || s}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<Label className="mb-1 block">Reason (optional)</Label>
						<Textarea
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Brief note for the order history"
							rows={3}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={isPending || !status}>
						{isPending ? "Updating..." : "Update Status"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AdminShipmentStatusDialog({
	shipment,
	orderId,
	open,
	onClose,
}: {
	shipment: ShipmentData;
	orderId: string;
	open: boolean;
	onClose: () => void;
}) {
	const [status, setStatus] = useState("");
	const [reason, setReason] = useState("");
	const { mutate: updateStatus, isPending } = useUpdateShipmentStatus();

	const nextStatuses = ADMIN_NEXT_STATUSES[shipment.status] || [];

	function handleSubmit() {
		if (!status || !reason.trim()) return;
		updateStatus(
			{ orderId, shipmentId: shipment.id, status, reason: reason.trim() },
			{
				onSuccess: () => {
					setStatus("");
					setReason("");
					onClose();
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Update Shipment Status (Admin)</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div>
						<p className="text-sm text-muted-foreground mb-1">
							Current:{" "}
							<span className="font-medium capitalize">
								{shipment.status?.replace(/_/g, " ")}
							</span>
						</p>
					</div>
					<div>
						<Label className="mb-1 block">New Status</Label>
						<Select value={status} onValueChange={setStatus}>
							<SelectTrigger>
								<SelectValue placeholder="Select status" />
							</SelectTrigger>
							<SelectContent>
								{nextStatuses.map((s) => (
									<SelectItem key={s} value={s}>
										{SHIPMENT_STATUS_LABELS[s] || s}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<Label className="mb-1 block">Reason</Label>
						<Textarea
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Reason for status change (required)"
							rows={3}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isPending || !status || !reason.trim()}
					>
						{isPending ? "Updating..." : "Update Status"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AdminCancelOrderDialog({
	order,
	open,
	onClose,
}: {
	order: MasterOrder;
	open: boolean;
	onClose: () => void;
}) {
	const [reason, setReason] = useState("");
	const [refund, setRefund] = useState(false);
	const [cancelFulfillment, setCancelFulfillment] = useState(true);
	const { mutate: cancelOrder, isPending } = useCancelAdminOrder();

	const remainingRefund =
		(order.grand_total ?? order.total ?? 0) - (order.refund_total ?? 0);
	const hasShipments = (order.vendorOrders ?? order.vendor_orders ?? []).some(
		(vo: VendorOrder) => (vo.shipments?.length ?? 0) > 0,
	);

	// COD has no card/BNPL instrument: cash is only "collected" once the payment
	// is captured on delivery. Uncollected COD refunds nothing; collected COD is
	// credited to the customer's wallet (the backend enforces both).
	const isCod = /cod|cash/i.test(order.payment_method ?? "");
	const codCollected = order.payment_status === "captured";
	const refundHelpText =
		isCod && !codCollected
			? "No payment was collected — nothing will be refunded."
			: isCod
				? `Credits the remaining amount${remainingRefund > 0 ? ` (${formatCurrency(remainingRefund)})` : ""} to the customer's wallet.`
				: `Refunds the remaining paid amount${remainingRefund > 0 ? ` (${formatCurrency(remainingRefund)})` : ""}.`;

	function handleSubmit() {
		const trimmedReason = reason.trim();
		if (!trimmedReason) return;

		cancelOrder(
			{
				orderId: order.id,
				reason: trimmedReason,
				refund,
				cancelFulfillment,
			},
			{
				onSuccess: () => {
					setReason("");
					setRefund(false);
					setCancelFulfillment(true);
					onClose();
					toast({ title: "Order cancelled" });
				},
				onError: (err: any) => {
					toast({
						title: "Cancellation failed",
						description:
							err?.response?.data?.message ?? "Could not cancel the order.",
						variant: "destructive",
					});
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Cancel Order</DialogTitle>
					<DialogDescription>
						Choose whether to refund the customer and cancel active carrier
						fulfillment.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
						This will mark the master order and vendor sub-orders as cancelled.
					</div>
					<div>
						<Label className="mb-1 block">Reason</Label>
						<Textarea
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Reason for cancellation (required)"
							rows={3}
						/>
					</div>
					<label className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm">
						<input
							type="checkbox"
							checked={refund}
							onChange={(e) => setRefund(e.target.checked)}
							className="mt-1 h-4 w-4 rounded border-gray-300"
						/>
						<span>
							<span className="block font-medium text-cacao">
								Refund customer
							</span>
							<span className="block text-xs text-muted-foreground">
								{refundHelpText}
							</span>
						</span>
					</label>
					<label className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm">
						<input
							type="checkbox"
							checked={cancelFulfillment}
							onChange={(e) => setCancelFulfillment(e.target.checked)}
							disabled={!hasShipments}
							className="mt-1 h-4 w-4 rounded border-gray-300 disabled:opacity-50"
						/>
						<span>
							<span className="block font-medium text-cacao">
								Cancel shipment and pickup
							</span>
							<span className="block text-xs text-muted-foreground">
								Calls PostaPlus cancellation for active shipments and pickup
								codes.
							</span>
						</span>
					</label>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Keep Order
					</Button>
					<Button
						variant="destructive"
						onClick={handleSubmit}
						disabled={isPending || !reason.trim()}
					>
						{isPending ? "Cancelling..." : "Cancel Order"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface CancellableRow {
	orderItemId: string;
	vendorName: string;
	productName: string;
	variantLabel?: string;
	activeQuantity: number;
}

function AdminCancelItemsDialog({
	orderId,
	vendorOrders,
	open,
	onClose,
}: {
	orderId: string;
	vendorOrders: VendorOrder[];
	open: boolean;
	onClose: () => void;
}) {
	const [reason, setReason] = useState("");
	const [quantities, setQuantities] = useState<Record<string, number>>({});
	const { mutate: cancelItems, isPending } = useCancelAdminOrderItems();

	const rows: CancellableRow[] = vendorOrders
		.filter((vo) => PRE_SHIPMENT_VENDOR_ORDER_STATUSES.has(vo.status))
		.flatMap((vo) =>
			(vo.items ?? [])
				.map((item) => ({
					orderItemId: item.id,
					vendorName: vo.vendor_name,
					productName: item.product_name,
					variantLabel: item.variant_label,
					activeQuantity: item.quantity - (item.refunded_quantity ?? 0),
				}))
				.filter((row) => row.activeQuantity > 0),
		);

	function setQuantity(orderItemId: string, value: number, max: number) {
		const clamped = Math.max(0, Math.min(value, max));
		setQuantities((prev) => ({ ...prev, [orderItemId]: clamped }));
	}

	function handleSubmit() {
		const trimmedReason = reason.trim();
		if (!trimmedReason) return;

		const items = rows
			.map((row) => ({
				order_item_id: row.orderItemId,
				quantity: quantities[row.orderItemId] ?? 0,
			}))
			.filter((row) => row.quantity >= 1);

		if (items.length === 0) return;

		cancelItems(
			{ orderId, reason: trimmedReason, items },
			{
				onSuccess: () => {
					setReason("");
					setQuantities({});
					onClose();
					toast({ title: "Items cancelled" });
				},
				onError: (err: any) => {
					toast({
						title: "Cancellation failed",
						description:
							err?.response?.data?.message ?? "Could not cancel the items.",
						variant: "destructive",
					});
				},
			},
		);
	}

	const selectedCount = Object.values(quantities).filter((q) => q >= 1).length;

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Cancel Items</DialogTitle>
					<DialogDescription>
						Cancel specific quantities of items that haven't shipped yet.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					{rows.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">
							No cancellable items remain in a pre-shipment status.
						</p>
					) : (
						<div className="space-y-2 max-h-64 overflow-y-auto">
							{rows.map((row) => (
								<div
									key={row.orderItemId}
									className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2"
								>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-cacao truncate">
											{row.productName}
										</p>
										<p className="text-xs text-taupe">
											{row.vendorName}
											{row.variantLabel ? ` · ${row.variantLabel}` : ""} ·{" "}
											{row.activeQuantity} available
										</p>
									</div>
									<input
										type="number"
										min={0}
										max={row.activeQuantity}
										value={quantities[row.orderItemId] ?? 0}
										onChange={(e) =>
											setQuantity(
												row.orderItemId,
												Number(e.target.value),
												row.activeQuantity,
											)
										}
										className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-right"
									/>
								</div>
							))}
						</div>
					)}
					<div>
						<Label className="mb-1 block">Reason</Label>
						<Textarea
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Reason for cancelling these items (required)"
							rows={3}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
					<Button
						variant="destructive"
						onClick={handleSubmit}
						disabled={isPending || !reason.trim() || selectedCount === 0}
					>
						{isPending ? "Cancelling..." : "Cancel Items"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ShipmentHistoryTimeline({ shipmentId }: { shipmentId: string }) {
	const { data: history, isLoading } = useShipmentHistory(shipmentId);

	if (isLoading) {
		return <Skeleton className="h-20 rounded-lg" />;
	}

	if (!history?.length) {
		return (
			<p className="text-xs text-muted-foreground py-2">No status history.</p>
		);
	}

	return (
		<ol className="relative border-l border-gray-200 ml-2 space-y-3 py-2">
			{history.map((entry: any) => (
				<li key={entry.id} className="ml-4">
					<span className="absolute -left-1.5 w-3 h-3 rounded-full bg-pearl/300 border-2 border-white" />
					<div className="text-xs">
						<span className="font-medium capitalize">
							{entry.from_status?.replace(/_/g, " ")}
						</span>
						{" → "}
						<span className="font-medium capitalize">
							{entry.to_status?.replace(/_/g, " ")}
						</span>
						<Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">
							{entry.changed_by_role}
						</Badge>
					</div>
					{entry.reason && (
						<p className="text-xs text-muted-foreground mt-0.5">
							{entry.reason}
						</p>
					)}
					<p className="text-[10px] text-muted-foreground mt-0.5">
						{new Date(entry.created_at).toLocaleString("en-AE", {
							day: "2-digit",
							month: "short",
							hour: "2-digit",
							minute: "2-digit",
						})}
					</p>
				</li>
			))}
		</ol>
	);
}

// Full raw carrier feed (shipment_events) for a shipment — every tracking ping,
// including status-neutral and ignored/duplicate ones, oldest first. Superset of
// the status-history timeline. Each row exposes the raw PostaPlus payload for
// debugging.
function ShipmentCarrierEventsTimeline({ shipmentId }: { shipmentId: string }) {
	const { data: events, isLoading } = useShipmentEvents(shipmentId);

	if (isLoading) {
		return <Skeleton className="h-20 rounded-lg" />;
	}

	if (!events?.length) {
		return <p className="text-xs text-muted-foreground py-2">No carrier events.</p>;
	}

	return (
		<ol className="relative border-l border-gray-200 ml-2 space-y-3 py-2">
			{events.map((event: any) => (
				<li key={event.id} className="ml-4">
					<span className="absolute -left-1.5 w-3 h-3 rounded-full bg-pearl/300 border-2 border-white" />
					<div className="text-xs flex items-center gap-2 flex-wrap">
						<span className="font-medium">
							{event.description || "Carrier update"}
						</span>
						<StatusBadge status={event.status} />
					</div>
					{event.location && (
						<p className="text-xs text-muted-foreground mt-0.5">
							{event.location}
						</p>
					)}
					<p className="text-[10px] text-muted-foreground mt-0.5">
						{new Date(event.occurred_at).toLocaleString("en-AE", {
							day: "2-digit",
							month: "short",
							hour: "2-digit",
							minute: "2-digit",
						})}
						{event.external_event_id && (
							<span className="ml-2 font-mono break-all">
								{event.external_event_id}
							</span>
						)}
					</p>
					{event.raw_payload && (
						<details className="mt-1">
							<summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-cacao">
								raw payload
							</summary>
							<pre className="mt-1 text-[10px] bg-pearl/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
								{JSON.stringify(event.raw_payload, null, 2)}
							</pre>
						</details>
					)}
				</li>
			))}
		</ol>
	);
}

function formatCurrency(fils: number) {
	return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

function VendorOrderCard({
	vo,
	orderId,
}: { vo: VendorOrder; orderId: string }) {
	const [expanded, setExpanded] = useState(false);
	const [statusDialogShipment, setStatusDialogShipment] =
		useState<ShipmentData | null>(null);
	const [historyShipmentId, setHistoryShipmentId] = useState<string | null>(
		null,
	);
	const [eventsShipmentId, setEventsShipmentId] = useState<string | null>(null);
	const [voStatusDialogOpen, setVoStatusDialogOpen] = useState(false);
	const retryBooking = useRetryShipmentBooking();

	const canTransitionVo =
		!TERMINAL_VENDOR_ORDER_STATUSES.has(vo.status) &&
		(VENDOR_ORDER_NEXT_STATUSES_FOR_ADMIN[vo.status]?.length ?? 0) > 0;
	// Carrier booking can only be (re)attempted while the sub-order is still
	// confirmed and nothing has been booked yet — mirrors the backend checks.
	const canRetryBooking =
		vo.status === "confirmed" && (vo.shipments?.length ?? 0) === 0;

	return (
		<div className="border border-gray-200 rounded-lg overflow-hidden">
			<div className="w-full flex items-center gap-3 px-4 py-3 bg-pearl/50">
				<button
					type="button"
					className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-pearl/100 -m-1 p-1 rounded transition-colors"
					onClick={() => setExpanded((e) => !e)}
				>
					{expanded ? (
						<ChevronDown size={16} className="text-taupe flex-shrink-0" />
					) : (
						<ChevronRight size={16} className="text-taupe flex-shrink-0" />
					)}
					<div className="flex-1 min-w-0">
						<p className="text-sm font-semibold text-cacao">{vo.vendor_name}</p>
						<p className="text-xs text-taupe">
							{vo.items?.length ?? 0} item(s)
						</p>
					</div>
				</button>
				<StatusBadge status={vo.status} />
				<span className="text-sm font-semibold text-cacao ml-2 tabular-nums">
					{formatCurrency(vo.subtotal)}
				</span>
				{canRetryBooking && (
					<Button
						variant="outline"
						size="sm"
						className="text-xs h-7 ml-2"
						disabled={retryBooking.isPending || retryBooking.isSuccess}
						onClick={() =>
							retryBooking.mutate({ orderId, vendorOrderId: vo.id })
						}
					>
						{retryBooking.isPending
							? "Booking..."
							: retryBooking.isSuccess
								? "Booking Queued"
								: "Book Shipment"}
					</Button>
				)}
				{canTransitionVo && (
					<Button
						variant="outline"
						size="sm"
						className="text-xs h-7 ml-2"
						onClick={() => setVoStatusDialogOpen(true)}
					>
						Update Status
					</Button>
				)}
			</div>
			{retryBooking.isError && (
				<p className="px-4 py-1.5 text-xs text-red-600 bg-red-50 border-t border-red-100">
					{(retryBooking.error as any)?.response?.data?.message ||
						"Failed to queue shipment booking"}
				</p>
			)}
			{vo.booking_error &&
				canRetryBooking &&
				!retryBooking.isPending &&
				!retryBooking.isSuccess && (
					<p className="px-4 py-1.5 text-xs text-red-600 bg-red-50 border-t border-red-100">
						Carrier booking failed: {vo.booking_error}
					</p>
				)}

			{expanded && (
				<div>
					{/* Items */}
					<div className="divide-y divide-gray-100">
						{(vo.items ?? []).map((item) => (
							<div key={item.id} className="flex items-center gap-3 px-4 py-3">
								{item.thumbnail_url ? (
									<img
										src={item.thumbnail_url}
										alt={item.product_name}
										className="w-10 h-10 rounded-md object-cover flex-shrink-0 border border-gray-200"
									/>
								) : (
									<div className="w-10 h-10 rounded-md bg-pearl/100 flex items-center justify-center flex-shrink-0">
										<Package size={16} className="text-taupe" />
									</div>
								)}
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-cacao truncate">
										{item.product_name}
									</p>
									{item.variant_label && (
										<p className="text-xs text-taupe">{item.variant_label}</p>
									)}
									{item.external_id && (
										<p className="text-xs text-taupe">Ref: {item.external_id}</p>
									)}
								</div>
								<div className="text-right flex-shrink-0">
									<p className="text-sm text-cacao tabular-nums">
										{item.quantity} × {formatCurrency(item.unit_price)}
									</p>
									<p className="text-sm font-semibold text-cacao tabular-nums">
										{formatCurrency(item.total_price)}
									</p>
								</div>
							</div>
						))}
					</div>

					{/* Shipments */}
					{(vo.shipments?.length ?? 0) > 0 && (
						<div className="border-t border-gray-100 px-4 py-3">
							<p className="text-xs font-semibold text-taupe uppercase tracking-wide mb-2 flex items-center gap-1.5">
								<Truck size={12} /> Shipments
							</p>
							<div className="space-y-2">
								{vo.shipments!.map((shipment) => (
									<div key={shipment.id}>
										<div className="flex items-center gap-3 p-2 bg-pearl/50 rounded-md">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 mb-0.5">
													<span className="text-xs font-medium capitalize">
														{shipment.carrier?.replace(/_/g, " ") || "Unknown"}
													</span>
													<StatusBadge status={shipment.status} />
												</div>
												<p className="text-[11px] text-muted-foreground">
													{shipment.tracking_url && shipment.tracking_number ? (
														<a
															href={shipment.tracking_url}
															target="_blank"
															rel="noreferrer"
															className="underline hover:text-cacao"
														>
															{shipment.tracking_number}
														</a>
													) : (
														shipment.tracking_number || "No tracking #"
													)}
													{shipment.pickup_code && (
														<span className="ml-2">
															Pickup: {shipment.pickup_code}
														</span>
													)}
												</p>
											</div>
											<div className="flex items-center gap-1">
												{shipment.label_url && (
													<Button
														variant="ghost"
														size="sm"
														className="text-xs h-7"
														asChild
													>
														<a
															href={shipment.label_url}
															target="_blank"
															rel="noreferrer"
														>
															Label
														</a>
													</Button>
												)}
												<Button
													variant="ghost"
													size="sm"
													className="text-xs h-7"
													onClick={() =>
														setHistoryShipmentId(
															historyShipmentId === shipment.id
																? null
																: shipment.id,
														)
													}
												>
													{historyShipmentId === shipment.id
														? "Hide History"
														: "View History"}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="text-xs h-7"
													onClick={() =>
														setEventsShipmentId(
															eventsShipmentId === shipment.id
																? null
																: shipment.id,
														)
													}
												>
													{eventsShipmentId === shipment.id
														? "Hide Webhook Log"
														: "Webhook Log"}
												</Button>
												{!TERMINAL_SHIPMENT_STATUSES.has(shipment.status) &&
													(ADMIN_NEXT_STATUSES[shipment.status]?.length ?? 0) >
														0 && (
														<Button
															variant="outline"
															size="sm"
															className="text-xs h-7"
															onClick={() => setStatusDialogShipment(shipment)}
														>
															Update Status
														</Button>
													)}
											</div>
										</div>
										{historyShipmentId === shipment.id && (
											<ShipmentHistoryTimeline shipmentId={shipment.id} />
										)}
										{eventsShipmentId === shipment.id && (
											<div className="mt-1">
												<p className="text-[10px] font-semibold text-taupe uppercase tracking-wide px-2">
													Carrier events (webhook feed)
												</p>
												<ShipmentCarrierEventsTimeline
													shipmentId={shipment.id}
												/>
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}

			{statusDialogShipment && (
				<AdminShipmentStatusDialog
					shipment={statusDialogShipment}
					orderId={orderId}
					open={!!statusDialogShipment}
					onClose={() => setStatusDialogShipment(null)}
				/>
			)}

			{voStatusDialogOpen && (
				<AdminVendorOrderStatusDialog
					vo={vo}
					orderId={orderId}
					open={voStatusDialogOpen}
					onClose={() => setVoStatusDialogOpen(false)}
				/>
			)}
		</div>
	);
}

export default function OrderDetailPage() {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
	const [cancelItemsDialogOpen, setCancelItemsDialogOpen] = useState(false);
	const [downloadingInvoice, setDownloadingInvoice] = useState(false);

	const { data: order, isLoading } = useOrder(id) as {
		data: MasterOrder | undefined;
		isLoading: boolean;
	};

	if (isLoading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-48 w-full rounded-xl" />
				<Skeleton className="h-64 w-full rounded-xl" />
			</div>
		);
	}

	if (!order) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-4">
				<p className="text-taupe">Order not found.</p>
				<Button variant="outline" onClick={() => router.back()}>
					Go Back
				</Button>
			</div>
		);
	}

	// Map API fields
	const addr = order.shipping_address || {};
	const customerName =
		addr.full_name ||
		`${addr.first_name || ""} ${addr.last_name || ""}`.trim() ||
		"—";
	const paymentMethod =
		order.payments?.[0]?.payment_method || order.payment_method || "—";

	const vendorOrders: VendorOrder[] = (
		order.vendorOrders ??
		order.vendor_orders ??
		[]
	).map((vo: any) => ({
		...vo,
		vendor_name: vo.vendor_name || vo.vendor_order_number || vo.vendor_id,
		shipments: vo.shipments ?? [],
		items: (vo.items ?? []).map((item: any) => ({
			...item,
			total_price:
				item.total_price ?? item.line_total ?? item.unit_price * item.quantity,
			thumbnail_url: item.thumbnail_url ?? item.product_image_url,
			variant_label: item.variant_label ?? item.variant_name,
		})),
	}));
	const canCancelOrder = !TERMINAL_MASTER_ORDER_STATUSES.has(order.status);
	const canCancelItems = vendorOrders.some((vo) =>
		PRE_SHIPMENT_VENDOR_ORDER_STATUSES.has(vo.status),
	);
	const allOrderItems: OrderItem[] = vendorOrders.flatMap((vo) => vo.items ?? []);

	const handleDownloadInvoice = async () => {
		setDownloadingInvoice(true);
		try {
			const res = await api.get(`/admin/orders/${order.id}/invoice.pdf`, {
				maxRedirects: 0,
				validateStatus: (status) => status >= 200 && status < 400,
			});
			const redirectUrl = res.headers.location || res.request?.responseURL;
			if (redirectUrl) {
				window.open(redirectUrl, "_blank");
			} else {
				window.open(`${api.defaults.baseURL || "http://localhost:3000"}/admin/orders/${order.id}/invoice.pdf`, "_blank");
			}
		} catch (err: any) {
			if (err?.response?.headers?.location) {
				window.open(err.response.headers.location, "_blank");
			} else {
				window.open(`${api.defaults.baseURL || "http://localhost:3000"}/admin/orders/${order.id}/invoice.pdf`, "_blank");
			}
		} finally {
			setDownloadingInvoice(false);
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => router.back()}
					className="gap-1.5"
				>
					<ArrowLeft size={16} />
					Back
				</Button>
				<Separator orientation="vertical" className="h-5" />
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<h1 className="text-xl font-bold text-cacao font-mono">
							{order.order_number}
						</h1>
						<StatusBadge status={order.status} />
					</div>
					<p className="text-taupe text-sm">
						Placed on{" "}
						{new Date(order.created_at).toLocaleDateString("en-AE", {
							year: "numeric",
							month: "long",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5"
					onClick={handleDownloadInvoice}
					disabled={downloadingInvoice}
				>
					<FileText size={16} />
					{downloadingInvoice ? "Generating..." : "Download Invoice"}
				</Button>
				{canCancelItems && (
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
						onClick={() => setCancelItemsDialogOpen(true)}
					>
						<XCircle size={16} />
						Cancel Items
					</Button>
				)}
				{canCancelOrder && (
					<Button
						variant="outline"
						size="sm"
						className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
						onClick={() => setCancelDialogOpen(true)}
					>
						<XCircle size={16} />
						Cancel Order
					</Button>
				)}
			</div>

			{/* Master Order Info */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				{/* Customer Info */}
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-semibold text-taupe uppercase tracking-wide">
							Customer
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1">
						<p className="text-sm font-semibold text-cacao">{customerName}</p>
						{addr.phone && <p className="text-sm text-taupe">{addr.phone}</p>}
					</CardContent>
				</Card>

				{/* Payment Info */}
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-semibold text-taupe uppercase tracking-wide">
							Payment
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1">
						<div className="flex items-center gap-2">
							<Badge variant="outline" className="capitalize text-xs">
								{paymentMethod.replace(/_/g, " ")}
							</Badge>
							<Badge variant="outline" className="capitalize text-xs">
								{order.payment_status?.replace(/_/g, " ") ?? "—"}
							</Badge>
						</div>
						<div className="space-y-1 pt-1 text-sm">
							<div className="flex justify-between text-taupe">
								<span>Subtotal</span>
								<span className="tabular-nums">
									{formatCurrency(order.subtotal ?? 0)}
								</span>
							</div>
							{order.discount_total > 0 && (
								<div className="flex justify-between text-green-600">
									<span>Discount</span>
									<span className="tabular-nums">
										-{formatCurrency(order.discount_total)}
									</span>
								</div>
							)}
							<div className="flex justify-between text-taupe">
								<span>VAT</span>
								<span className="tabular-nums">
									{formatCurrency(order.tax_total ?? 0)}
								</span>
							</div>
							<div className="flex justify-between text-taupe">
								<span>Shipping</span>
								<span className="tabular-nums">
									{formatCurrency(order.shipping_total ?? 0)}
								</span>
							</div>
							<Separator className="my-1" />
							<div className="flex justify-between font-semibold text-cacao">
								<span>Total</span>
								<span className="tabular-nums">
									{formatCurrency(order.grand_total ?? 0)}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Shipping Address */}
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-semibold text-taupe uppercase tracking-wide">
							Shipping Address
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-sm text-cacao space-y-0.5">
							<p className="font-medium">{customerName}</p>
							<p>{addr.address_line_1 || addr.street}</p>
							{(addr.address_line_2 || addr.area) && (
								<p>{addr.address_line_2 || addr.area}</p>
							)}
							<p>
								{addr.city}
								{addr.state || addr.emirate
									? `, ${addr.state || addr.emirate}`
									: ""}
							</p>
							{addr.phone && <p className="text-taupe">{addr.phone}</p>}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Vendor Sub-orders */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base font-semibold">
						Vendor Sub-orders
						<span className="ml-2 text-sm font-normal text-taupe">
							({vendorOrders.length} vendor
							{vendorOrders.length !== 1 ? "s" : ""})
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{vendorOrders.length === 0 ? (
						<p className="text-sm text-muted-foreground text-center py-8">
							No vendor sub-orders found.
						</p>
					) : (
						vendorOrders.map((vo) => (
							<VendorOrderCard key={vo.id} vo={vo} orderId={id} />
						))
					)}
				</CardContent>
			</Card>

			{/* Cancellations */}
			{(order.cancellations?.length ?? 0) > 0 && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-base font-semibold">
							Cancellations
							<span className="ml-2 text-sm font-normal text-taupe">
								({order.cancellations!.length} record
								{order.cancellations!.length !== 1 ? "s" : ""})
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{order.cancellations!.map((c) => (
							<div
								key={c.id}
								className="rounded-lg border border-gray-200 px-4 py-3 space-y-2"
							>
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-sm font-medium text-cacao">{c.reason}</p>
										<p className="text-xs text-taupe">
											{new Date(c.created_at).toLocaleString("en-AE", {
												day: "2-digit",
												month: "short",
												year: "numeric",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</p>
									</div>
									<StatusBadge status={c.status} />
								</div>
								<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-taupe">
									<span>
										Refund:{" "}
										<span className="font-medium text-cacao">
											{formatCurrency(c.refund_amount)}
										</span>{" "}
										via <span className="capitalize">{c.refund_method}</span>
									</span>
									{c.gateway_refund_id && (
										<span>Gateway ref: {c.gateway_refund_id}</span>
									)}
								</div>
								{c.items?.length > 0 && (
									<div className="divide-y divide-gray-100 border-t border-gray-100 pt-2">
										{c.items.map((ci, idx) => {
											const matchedItem = allOrderItems.find(
												(item) => item.id === ci.order_item_id,
											);
											return (
												<div
													key={`${ci.order_item_id}-${idx}`}
													className="flex items-center justify-between py-1 text-sm"
												>
													<span className="text-cacao truncate">
														{matchedItem?.product_name ?? "Unknown item"}
														<span className="text-taupe"> × {ci.quantity}</span>
													</span>
													<span className="text-cacao tabular-nums">
														{formatCurrency(ci.refund_amount)}
													</span>
												</div>
											);
										})}
									</div>
								)}
							</div>
						))}
					</CardContent>
				</Card>
			)}

			{cancelDialogOpen && (
				<AdminCancelOrderDialog
					order={order}
					open={cancelDialogOpen}
					onClose={() => setCancelDialogOpen(false)}
				/>
			)}
			{cancelItemsDialogOpen && (
				<AdminCancelItemsDialog
					orderId={id}
					vendorOrders={vendorOrders}
					open={cancelItemsDialogOpen}
					onClose={() => setCancelItemsDialogOpen(false)}
				/>
			)}
		</div>
	);
}
