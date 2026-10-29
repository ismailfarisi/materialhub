"use client";

import { useCanManageBookings } from "@/hooks/use-vendor-role";
import { OfferingForm } from "@/components/bookings/OfferingForm";
import { Button } from "@materialhub/ui";
import Link from "next/link";

export default function NewServicePage() {
	const canWrite = useCanManageBookings();

	if (!canWrite) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-bold text-cacao">New Service</h1>
				<p className="text-sm text-taupe">
					You have read-only access to Services. Ask an owner or manager to create a
					new one.
				</p>
				<Button asChild variant="outline">
					<Link href="/services">Back to Services</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold text-cacao">New Service</h1>
				<p className="text-sm text-taupe">
					Set up a bookable service. It saves as a draft — publish it when you're
					ready to accept bookings.
				</p>
			</div>
			<OfferingForm canWrite={canWrite} />
		</div>
	);
}
