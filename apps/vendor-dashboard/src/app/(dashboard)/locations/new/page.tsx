"use client";

import { LocationForm } from "@/components/bookings/LocationForm";
import { useCanManageBookings } from "@/hooks/use-vendor-role";
import { Button } from "@materialhub/ui";
import Link from "next/link";

export default function NewLocationPage() {
	const canWrite = useCanManageBookings();

	if (!canWrite) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-bold text-cacao">New Location</h1>
				<p className="text-sm text-taupe">
					You have read-only access to Locations. Ask an owner or manager to add a
					new one.
				</p>
				<Button asChild variant="outline">
					<Link href="/locations">Back to Locations</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold text-cacao">New Location</h1>
				<p className="text-sm text-taupe">Add a branch where customers can book services.</p>
			</div>
			<LocationForm canWrite={canWrite} />
		</div>
	);
}
