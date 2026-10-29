"use client";

import { OfferingForm } from "@/components/bookings/OfferingForm";
import { useCanManageBookings } from "@/hooks/use-vendor-role";
import { getOfferingStatusActions, type OfferingStatusAction } from "@/lib/offering-status";
import { useUpdateService, useVendorService } from "@/lib/queries/offerings";
import { Button, ConfirmDialog, StatusBadge, toast } from "@materialhub/ui";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function EditServicePage() {
	const params = useParams<{ id: string }>();
	const id = params.id;
	const { data: offering, isLoading } = useVendorService(id);
	const canWrite = useCanManageBookings();
	const updateService = useUpdateService();
	const [confirmNext, setConfirmNext] = useState<OfferingStatusAction | null>(null);

	if (isLoading) {
		return <div className="p-6 text-sm text-taupe">Loading…</div>;
	}

	if (!offering) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-bold text-cacao">Service not found</h1>
				<p className="text-sm text-taupe">
					This service doesn't exist, or belongs to a different vendor.
				</p>
				<Button asChild variant="outline">
					<a href="/services">Back to Services</a>
				</Button>
			</div>
		);
	}

	const statusActions = getOfferingStatusActions(offering.status, {
		publishRequiresReview: offering.publish_requires_review !== false,
	});

	async function runStatusChange() {
		if (!confirmNext || !offering) return;
		try {
			await updateService.mutateAsync({
				id: offering.id,
				payload: { status: confirmNext.next },
			});
			toast({ title: `${offering.name} ${confirmNext.done}` });
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not update status",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-bold text-cacao">{offering.name}</h1>
						<StatusBadge status={offering.status} />
					</div>
					<p className="text-sm text-taupe">Edit this service's details.</p>
					{offering.status === "pending_review" && (
						<div className="rounded-lg border border-caramel/30 bg-caramel/10 px-4 py-3 text-sm text-cacao">
							This service is awaiting review by the MaterialHub team. It is not bookable yet.
							You will be able to publish future services without review once this one is
							approved.
						</div>
					)}
					{offering.status === "rejected" && offering.rejection_reason && (
						<div className="rounded-lg border border-russet/30 bg-russet/10 px-4 py-3 text-sm text-cacao">
							<span className="font-medium">This service was not approved:</span>{" "}
							{offering.rejection_reason}
							<p className="mt-1 text-taupe">
								Make the changes above, then resubmit for review.
							</p>
						</div>
					)}
				</div>
				{canWrite && statusActions.length > 0 && (
					<div className="flex gap-2">
						{statusActions.map((action) => (
							<Button
								key={action.next}
								variant="outline"
								size="sm"
								onClick={() => setConfirmNext(action)}
							>
								{action.label}
							</Button>
						))}
					</div>
				)}
			</div>

			<OfferingForm offering={offering} canWrite={canWrite} />

			<ConfirmDialog
				open={!!confirmNext}
				title={confirmNext ? `${confirmNext.label} "${offering.name}"?` : ""}
				description={confirmNext?.description}
				confirmLabel={confirmNext?.label}
				busy={updateService.isPending}
				onConfirm={runStatusChange}
				onClose={() => setConfirmNext(null)}
			/>
		</div>
	);
}
