"use client";

import { useCanManageBookings } from "@/hooks/use-vendor-role";
import { getOfferingStatusActions } from "@/lib/offering-status";
import {
	type OfferingStatus,
	type ServiceOffering,
	useUpdateService,
	useVendorServices,
} from "@/lib/queries/offerings";
import {
	Button,
	ConfirmDialog,
	DataTable,
	EmptyState,
	StatusBadge,
	toast,
} from "@materialhub/ui";
import { CalendarCheck, PencilSimple, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function formatPrice(fils: number) {
	return `AED ${(fils / 100).toFixed(2)}`;
}

function formatDuration(minutes: number) {
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

interface PendingAction {
	offering: ServiceOffering;
	next: OfferingStatus;
	label: string;
	description: string;
}

export default function ServicesPage() {
	const router = useRouter();
	const { data: offerings = [], isLoading } = useVendorServices();
	const canWrite = useCanManageBookings();
	const updateService = useUpdateService();
	const [pending, setPending] = useState<PendingAction | null>(null);

	async function runPendingAction() {
		if (!pending) return;
		try {
			await updateService.mutateAsync({
				id: pending.offering.id,
				payload: { status: pending.next },
			});
			toast({
				title: `${pending.offering.name} → ${pending.label.toLowerCase()}d`,
			});
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not update status",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		}
	}

	const columns = [
		{
			id: "name",
			header: "Service",
			cell: ({ row }: { row: { original: ServiceOffering } }) => (
				<Link
					href={`/services/${row.original.id}/edit`}
					className="font-medium hover:underline text-sm"
				>
					{row.original.name}
				</Link>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }: { row: { original: ServiceOffering } }) => (
				<StatusBadge status={row.original.status} />
			),
		},
		{
			id: "price",
			header: "Price",
			cell: ({ row }: { row: { original: ServiceOffering } }) => (
				<span className="text-sm">{formatPrice(row.original.price_fils)}</span>
			),
		},
		{
			id: "duration",
			header: "Duration",
			cell: ({ row }: { row: { original: ServiceOffering } }) => (
				<span className="text-sm text-muted-foreground">
					{formatDuration(row.original.duration_minutes)}
				</span>
			),
		},
		{
			id: "payment_mode",
			header: "Payment",
			cell: ({ row }: { row: { original: ServiceOffering } }) => (
				<span className="text-sm text-muted-foreground">
					{row.original.payment_mode.replace(/_/g, " ")}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }: { row: { original: ServiceOffering } }) => {
				const offering = row.original;
				if (!canWrite) return null;
				const actions = getOfferingStatusActions(offering.status, {
					publishRequiresReview: offering.publish_requires_review !== false,
				});
				return (
					<div className="flex gap-2 justify-end">
						<Button variant="ghost" size="sm" asChild aria-label="Edit service">
							<Link href={`/services/${offering.id}/edit`}>
								<PencilSimple size={16} />
							</Link>
						</Button>
						{actions.map((action) => (
							<Button
								key={action.next}
								variant="outline"
								size="sm"
								onClick={() =>
									setPending({
										offering,
										next: action.next,
										label: action.label,
										description: action.description,
									})
								}
							>
								{action.label}
							</Button>
						))}
					</div>
				);
			},
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-cacao">Services</h1>
					<p className="text-sm text-taupe">
						Manage the bookable services customers reserve as appointments.
					</p>
				</div>
				{canWrite && (
					<Button asChild>
						<Link href="/services/new">
							<Plus size={16} className="mr-2" />
							New Service
						</Link>
					</Button>
				)}
			</div>

			{!isLoading && offerings.length === 0 ? (
				<EmptyState
					icon={<CalendarCheck size={40} />}
					title="No services yet"
					description={
						canWrite
							? "Create your first service to unlock the Bookings module — calendar, staff, locations, and hours."
							: "This vendor has no services configured yet. Ask an owner or manager to add one."
					}
					action={
						canWrite
							? {
									label: "New Service",
									onClick: () => router.push("/services/new"),
								}
							: undefined
					}
				/>
			) : (
				<>
					<DataTable
						columns={columns}
						data={offerings}
						isLoading={isLoading}
						rowId="id"
					/>
					<div className="flex items-center justify-between pt-2">
						<span className="text-sm text-muted-foreground">
							Total: {offerings.length}{" "}
							{offerings.length === 1 ? "service" : "services"}
						</span>
					</div>
				</>
			)}

			<ConfirmDialog
				open={!!pending}
				title={pending ? `${pending.label} "${pending.offering.name}"?` : ""}
				description={pending?.description}
				confirmLabel={pending?.label}
				busy={updateService.isPending}
				onConfirm={runPendingAction}
				onClose={() => setPending(null)}
			/>
		</div>
	);
}
