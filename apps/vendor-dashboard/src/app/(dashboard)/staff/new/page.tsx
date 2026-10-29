"use client";

import { StaffProfileForm } from "@/components/bookings/StaffProfileForm";
import { useCanManageBookings } from "@/hooks/use-vendor-role";
import { Button } from "@materialhub/ui";
import Link from "next/link";

export default function NewStaffPage() {
	const canWrite = useCanManageBookings();

	if (!canWrite) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-bold text-cacao">New Staff Member</h1>
				<p className="text-sm text-taupe">
					You have read-only access to Staff. Ask an owner or manager to add a new
					one.
				</p>
				<Button asChild variant="outline">
					<Link href="/staff">Back to Staff</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold text-cacao">New Staff Member</h1>
				<p className="text-sm text-taupe">
					Add a bookable resource. Link them to locations, services, and hours
					after creating.
				</p>
			</div>
			<StaffProfileForm canWrite={canWrite} />
		</div>
	);
}
