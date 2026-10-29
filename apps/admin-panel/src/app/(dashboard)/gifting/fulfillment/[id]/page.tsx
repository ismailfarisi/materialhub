"use client";

import { PackingSlip } from "@/components/gifting/PackingSlip";
import {
	FULFILLMENT_STATUS_CLASSES,
	FULFILLMENT_STATUS_LABELS,
	type FulfillmentStatus,
	type VendorParcel,
	useCancelGiftOrder,
	useDispatch,
	useGiftFulfillmentDetail,
	useMarkAssembled,
	useMarkDelivered,
	useMarkReceived,
	usePackingSlip,
} from "@/lib/queries/gift-fulfillment";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Input,
	Textarea,
	toast,
} from "@materialhub/ui";
import { ArrowLeft, Check, Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

function StatusPill({ status }: { status: FulfillmentStatus }) {
	return (
		<span
			className={`rounded-full px-2.5 py-0.5 text-xs ${FULFILLMENT_STATUS_CLASSES[status]}`}
		>
			{FULFILLMENT_STATUS_LABELS[status]}
		</span>
	);
}

function errMsg(e: any, fallback: string) {
	return e?.response?.data?.message ?? fallback;
}

export default function GiftFulfillmentDetailPage() {
	const { id } = useParams<{ id: string }>();
	const { data, isLoading } = useGiftFulfillmentDetail(id);

	const markReceived = useMarkReceived(id);
	const assemble = useMarkAssembled(id);
	const dispatch = useDispatch(id);
	const deliver = useMarkDelivered(id);
	const cancel = useCancelGiftOrder(id);

	const [assembleNotes, setAssembleNotes] = useState("");
	const [carrier, setCarrier] = useState("");
	const [trackingNumber, setTrackingNumber] = useState("");
	const [trackingUrl, setTrackingUrl] = useState("");
	const [showSlip, setShowSlip] = useState(false);

	const { data: slip, isFetching: slipLoading } = usePackingSlip(id, showSlip);

	if (isLoading) {
		return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
	}
	if (!data) {
		return (
			<div className="p-6 text-sm text-muted-foreground">
				Gift order not found.
			</div>
		);
	}

	const { giftOrder, vendorOrders } = data;
	const status = giftOrder.fulfillment_status;

	const canAssemble = status === "ready_to_assemble";
	const canDispatch = status === "packed";
	const canDeliver = status === "shipped";
	const canCancel = !["delivered", "cancelled"].includes(status);

	function onAssemble() {
		assemble.mutate(assembleNotes.trim() || undefined, {
			onSuccess: () => {
				toast({ title: "Gift box assembled" });
				setAssembleNotes("");
			},
			onError: (e: any) =>
				toast({
					title: "Error",
					description: errMsg(e, "Could not assemble."),
					variant: "destructive",
				}),
		});
	}

	function onDispatch() {
		if (!carrier.trim() || !trackingNumber.trim()) {
			toast({
				title: "Missing details",
				description: "Carrier and tracking number are required.",
				variant: "destructive",
			});
			return;
		}
		dispatch.mutate(
			{
				carrier: carrier.trim(),
				trackingNumber: trackingNumber.trim(),
				trackingUrl: trackingUrl.trim() || undefined,
			},
			{
				onSuccess: () => {
					toast({ title: "Dispatched" });
					setCarrier("");
					setTrackingNumber("");
					setTrackingUrl("");
				},
				onError: (e: any) =>
					toast({
						title: "Error",
						description: errMsg(e, "Could not dispatch."),
						variant: "destructive",
					}),
			},
		);
	}

	function onDeliver() {
		deliver.mutate(undefined, {
			onSuccess: () => toast({ title: "Marked delivered" }),
			onError: (e: any) =>
				toast({
					title: "Error",
					description: errMsg(e, "Could not mark delivered."),
					variant: "destructive",
				}),
		});
	}

	function onCancel() {
		const reason = prompt("Reason for cancelling this gift order?");
		if (!reason || !reason.trim()) return;
		cancel.mutate(reason.trim(), {
			onSuccess: () => toast({ title: "Gift order cancelled" }),
			onError: (e: any) =>
				toast({
					title: "Error",
					description: errMsg(e, "Could not cancel."),
					variant: "destructive",
				}),
		});
	}

	function onReceive(parcel: VendorParcel) {
		markReceived.mutate(parcel.id, {
			onSuccess: () => toast({ title: "Parcel received" }),
			onError: (e: any) =>
				toast({
					title: "Error",
					description: errMsg(e, "Could not mark received."),
					variant: "destructive",
				}),
		});
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start gap-3 print:hidden">
				<Button variant="ghost" size="sm" asChild className="mt-1 p-2">
					<Link href="/gifting/fulfillment">
						<ArrowLeft size={18} />
					</Link>
				</Button>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold text-cacao">
							{giftOrder.box_name_snapshot}
						</h1>
						<StatusPill status={status} />
					</div>
					<p className="text-taupe text-sm">
						Recipient: {giftOrder.recipient_name ?? "—"}
					</p>
					{giftOrder.gift_message ? (
						<p className="mt-2 max-w-2xl whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm italic text-taupe">
							“{giftOrder.gift_message}”
						</p>
					) : null}
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowSlip(true)}
					>
						<Printer size={15} className="mr-1.5" />
						Packing slip
					</Button>
					{canCancel ? (
						<Button
							variant="outline"
							size="sm"
							className="text-red-600"
							onClick={onCancel}
							disabled={cancel.isPending}
						>
							Cancel
						</Button>
					) : null}
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1fr_360px] print:block">
				{/* Receiving checklist */}
				<div className="space-y-6 print:hidden">
					<Card>
						<CardHeader>
							<CardTitle className="text-sm font-semibold uppercase tracking-wide text-cacao">
								Receiving checklist
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{vendorOrders.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No vendor parcels on this gift order.
								</p>
							) : (
								vendorOrders.map((vo) => {
									const received = !!vo.received_at_hub_at;
									return (
										<div
											key={vo.id}
											className="rounded-lg border border-gray-200 p-3"
										>
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<p className="font-medium text-cacao">
														{vo.vendor?.name ?? "Vendor"}
													</p>
													<p className="text-xs text-taupe">
														{vo.vendor_order_number} · {vo.status}
													</p>
													{vo.items && vo.items.length > 0 ? (
														<ul className="mt-2 space-y-0.5 text-sm text-taupe">
															{vo.items.map((it, i) => (
																<li key={`${it.product_name}-${i}`}>
																	{it.quantity}× {it.product_name}
																	{it.variant_name
																		? ` (${it.variant_name})`
																		: ""}
																</li>
															))}
														</ul>
													) : null}
												</div>
												<div className="shrink-0">
													{received ? (
														<span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
															<Check size={13} />
															{new Date(
																vo.received_at_hub_at as string,
															).toLocaleString()}
														</span>
													) : (
														<Button
															size="sm"
															onClick={() => onReceive(vo)}
															disabled={markReceived.isPending}
														>
															Mark received
														</Button>
													)}
												</div>
											</div>
										</div>
									);
								})
							)}
						</CardContent>
					</Card>

					{showSlip ? (
						<Card>
							<CardContent className="pt-6">
								{slipLoading || !slip ? (
									<p className="text-sm text-muted-foreground">
										Loading packing slip…
									</p>
								) : (
									<PackingSlip slip={slip} />
								)}
							</CardContent>
						</Card>
					) : null}
				</div>

				{/* Workflow actions */}
				<div className="space-y-4 print:hidden">
					{/* Assemble */}
					<Card>
						<CardHeader>
							<CardTitle className="text-sm font-semibold uppercase tracking-wide text-cacao">
								Assemble
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<p className="text-xs text-taupe">
								Enabled once all parcels are received (status: ready to
								assemble).
							</p>
							<Textarea
								value={assembleNotes}
								onChange={(e) => setAssembleNotes(e.target.value)}
								rows={2}
								placeholder="Assembly notes (optional)"
								disabled={!canAssemble}
							/>
							<Button
								className="w-full"
								onClick={onAssemble}
								disabled={!canAssemble || assemble.isPending}
							>
								{assemble.isPending && (
									<Loader2 size={16} className="mr-1.5 animate-spin" />
								)}
								Mark assembled
							</Button>
						</CardContent>
					</Card>

					{/* Dispatch */}
					<Card>
						<CardHeader>
							<CardTitle className="text-sm font-semibold uppercase tracking-wide text-cacao">
								Dispatch
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<p className="text-xs text-taupe">
								Enabled once the box is packed.
							</p>
							<div>
								<label className="mb-1 block text-sm font-medium text-cacao">
									Carrier *
								</label>
								<Input
									value={carrier}
									onChange={(e) => setCarrier(e.target.value)}
									placeholder="Aramex"
									disabled={!canDispatch}
								/>
							</div>
							<div>
								<label className="mb-1 block text-sm font-medium text-cacao">
									Tracking number *
								</label>
								<Input
									value={trackingNumber}
									onChange={(e) => setTrackingNumber(e.target.value)}
									placeholder="1234567890"
									disabled={!canDispatch}
								/>
							</div>
							<div>
								<label className="mb-1 block text-sm font-medium text-cacao">
									Tracking URL
								</label>
								<Input
									value={trackingUrl}
									onChange={(e) => setTrackingUrl(e.target.value)}
									placeholder="https://…"
									disabled={!canDispatch}
								/>
							</div>
							<Button
								className="w-full"
								onClick={onDispatch}
								disabled={!canDispatch || dispatch.isPending}
							>
								{dispatch.isPending && (
									<Loader2 size={16} className="mr-1.5 animate-spin" />
								)}
								Dispatch
							</Button>
						</CardContent>
					</Card>

					{/* Deliver */}
					<Card>
						<CardHeader>
							<CardTitle className="text-sm font-semibold uppercase tracking-wide text-cacao">
								Delivery
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<p className="text-xs text-taupe">
								Enabled once the box has shipped.
							</p>
							{giftOrder.outbound_carrier ? (
								<p className="text-sm text-taupe">
									{giftOrder.outbound_carrier} ·{" "}
									{giftOrder.outbound_tracking_url ? (
										<a
											href={giftOrder.outbound_tracking_url}
											target="_blank"
											rel="noreferrer"
											className="text-primary underline"
										>
											{giftOrder.outbound_tracking_number}
										</a>
									) : (
										giftOrder.outbound_tracking_number
									)}
								</p>
							) : null}
							<Button
								className="w-full"
								onClick={onDeliver}
								disabled={!canDeliver || deliver.isPending}
							>
								{deliver.isPending && (
									<Loader2 size={16} className="mr-1.5 animate-spin" />
								)}
								Mark delivered
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Print-only packing slip render */}
			{showSlip && slip ? (
				<div className="hidden print:block">
					<PackingSlip slip={slip} />
				</div>
			) : null}
		</div>
	);
}
