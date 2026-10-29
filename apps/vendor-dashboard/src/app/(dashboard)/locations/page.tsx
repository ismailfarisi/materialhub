"use client";

import { ServiceAreasPanel } from "@/components/bookings/ServiceAreasPanel";
import { useCanManageBookings } from "@/hooks/use-vendor-role";
import {
	type VendorLocation,
	useVendorLocations,
} from "@/lib/queries/locations";
import {
	Button,
	DataTable,
	EmptyState,
	StatusBadge,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@materialhub/ui";
import { MapPin, PencilSimple, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const LOCATION_STATUS_COLORS: Record<string, string> = {
	active: "bg-amber/10 text-amber border border-amber/30",
	inactive: "bg-pearl/20 text-taupe border border-pearl/30",
};

export default function LocationsPage() {
	const router = useRouter();
	const { data: locations = [], isLoading } = useVendorLocations();
	const canWrite = useCanManageBookings();

	const columns = [
		{
			id: "name",
			header: "Location",
			cell: ({ row }: { row: { original: VendorLocation } }) => (
				<Link
					href={`/locations/${row.original.id}/edit`}
					className="font-medium hover:underline text-sm"
				>
					{row.original.name}
				</Link>
			),
		},
		{
			id: "address",
			header: "Address",
			cell: ({ row }: { row: { original: VendorLocation } }) => {
				const a = row.original.address;
				const parts = a
					? [a.street, a.area, a.city, a.emirate].filter(Boolean)
					: [];
				return (
					<span className="text-sm text-muted-foreground">
						{parts.length > 0 ? parts.join(", ") : "—"}
					</span>
				);
			},
		},
		{
			id: "timezone",
			header: "Timezone",
			cell: ({ row }: { row: { original: VendorLocation } }) => (
				<span className="text-sm text-muted-foreground">
					{row.original.timezone}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }: { row: { original: VendorLocation } }) => (
				<StatusBadge
					status={row.original.is_active ? "active" : "inactive"}
					colorMap={LOCATION_STATUS_COLORS}
				/>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }: { row: { original: VendorLocation } }) => {
				if (!canWrite) return null;
				return (
					<div className="flex justify-end">
						<Button
							variant="ghost"
							size="sm"
							asChild
							aria-label="Edit location"
						>
							<Link href={`/locations/${row.original.id}/edit`}>
								<PencilSimple size={16} />
							</Link>
						</Button>
					</div>
				);
			},
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-cacao">Locations</h1>
					<p className="text-sm text-taupe">
						Manage your branches and the zones you cover for home-visit
						bookings.
					</p>
				</div>
			</div>

			<Tabs defaultValue="branches">
				<TabsList>
					<TabsTrigger value="branches">Branches</TabsTrigger>
					<TabsTrigger value="service-areas">Service Areas</TabsTrigger>
				</TabsList>

				<TabsContent value="branches" className="space-y-4">
					<div className="flex justify-end">
						{canWrite && (
							<Button asChild>
								<Link href="/locations/new">
									<Plus size={16} className="mr-2" />
									New Location
								</Link>
							</Button>
						)}
					</div>
					{!isLoading && locations.length === 0 ? (
						<EmptyState
							icon={<MapPin size={40} />}
							title="No locations yet"
							description={
								canWrite
									? "Add your first branch so customers can book at-premises services."
									: "This vendor has no locations configured yet. Ask an owner or manager to add one."
							}
							action={
								canWrite
									? {
											label: "New Location",
											onClick: () => router.push("/locations/new"),
										}
									: undefined
							}
						/>
					) : (
						<>
							<DataTable
								columns={columns}
								data={locations}
								isLoading={isLoading}
								rowId="id"
							/>
							<div className="flex items-center justify-between pt-2">
								<span className="text-sm text-muted-foreground">
									Total: {locations.length}{" "}
									{locations.length === 1 ? "location" : "locations"}
								</span>
							</div>
						</>
					)}
				</TabsContent>

				<TabsContent value="service-areas">
					<ServiceAreasPanel canWrite={canWrite} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
