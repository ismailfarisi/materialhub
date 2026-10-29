"use client";

import { LocationAdminsPanel } from "@/components/bookings/LocationAdminsPanel";
import { LocationForm } from "@/components/bookings/LocationForm";
import { useCanManageBookings } from "@/hooks/use-vendor-role";
import { useVendorLocation } from "@/lib/queries/locations";
import { Button, StatusBadge } from "@materialhub/ui";
import { useParams } from "next/navigation";

const LOCATION_STATUS_COLORS: Record<string, string> = {
	active: "bg-amber/10 text-amber border border-amber/30",
	inactive: "bg-pearl/20 text-taupe border border-pearl/30",
};

export default function EditLocationPage() {
	const params = useParams<{ id: string }>();
	const id = params.id;
	const { data: location, isLoading, isError } = useVendorLocation(id);
	const canWrite = useCanManageBookings();

	if (isLoading) {
		return <div className="p-6 text-sm text-taupe">Loading…</div>;
	}

	if (!location || isError) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-bold text-cacao">Location not found</h1>
				<p className="text-sm text-taupe">
					This location doesn't exist, or belongs to a different vendor.
				</p>
				<Button asChild variant="outline">
					<a href="/locations">Back to Locations</a>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<div className="flex items-center gap-2">
					<h1 className="text-2xl font-bold text-cacao">{location.name}</h1>
					<StatusBadge
						status={location.is_active ? "active" : "inactive"}
						colorMap={LOCATION_STATUS_COLORS}
					/>
				</div>
				<p className="text-sm text-taupe">Edit this location's details.</p>
			</div>
			<LocationForm location={location} canWrite={canWrite} />

			{/* Owner|manager only — hidden entirely for staff/viewer, per
			    task-7-brief.md Part 2. useCanManageBookings() already resolves to
			    owner|manager (see hooks/use-vendor-role.ts), matching the gate the
			    backend enforces independently (LocationMembershipService requires
			    isVendorManagerRole). */}
			{canWrite && (
				<div className="space-y-2">
					<div>
						<h2 className="text-lg font-semibold text-cacao">Location admins</h2>
						<p className="text-sm text-taupe">
							Grant team members management access scoped to this branch only.
						</p>
					</div>
					<LocationAdminsPanel locationId={id} />
				</div>
			)}
		</div>
	);
}
