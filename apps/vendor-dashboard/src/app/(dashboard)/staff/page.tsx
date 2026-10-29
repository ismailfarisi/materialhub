"use client";

import { useCanManageBookings } from "@/hooks/use-vendor-role";
import { type StaffMember, useVendorStaff } from "@/lib/queries/staff";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	DataTable,
	EmptyState,
	StatusBadge,
} from "@materialhub/ui";
import { Plus, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STAFF_STATUS_COLORS: Record<string, string> = {
	active: "bg-amber/10 text-amber border border-amber/30",
	inactive: "bg-pearl/20 text-taupe border border-pearl/30",
};

function initials(name: string): string {
	return name
		.split(" ")
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

export default function StaffPage() {
	const router = useRouter();
	const { data: staff = [], isLoading } = useVendorStaff();
	const canWrite = useCanManageBookings();

	const columns = [
		{
			id: "name",
			header: "Staff",
			cell: ({ row }: { row: { original: StaffMember } }) => (
				<Link
					href={`/staff/${row.original.id}`}
					className="flex items-center gap-2"
				>
					<Avatar className="h-8 w-8">
						<AvatarImage
							src={row.original.avatar_url ?? undefined}
							alt={row.original.name}
						/>
						<AvatarFallback>{initials(row.original.name)}</AvatarFallback>
					</Avatar>
					<span className="font-medium hover:underline text-sm">
						{row.original.name}
					</span>
				</Link>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }: { row: { original: StaffMember } }) => (
				<StatusBadge
					status={row.original.is_active ? "active" : "inactive"}
					colorMap={STAFF_STATUS_COLORS}
				/>
			),
		},
		{
			id: "rating",
			header: "Rating",
			cell: ({ row }: { row: { original: StaffMember } }) => {
				const rating = Number(row.original.rating);
				return (
					<span className="text-sm text-muted-foreground">
						{rating > 0
							? `${rating.toFixed(2)} (${row.original.rating_count})`
							: "—"}
					</span>
				);
			},
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-cacao">Staff</h1>
					<p className="text-sm text-taupe">
						Manage the people who deliver your bookable services.
					</p>
				</div>
				{canWrite && (
					<Button asChild>
						<Link href="/staff/new">
							<Plus size={16} className="mr-2" />
							New Staff Member
						</Link>
					</Button>
				)}
			</div>

			{!isLoading && staff.length === 0 ? (
				<EmptyState
					icon={<UsersThree size={40} />}
					title="No staff yet"
					description={
						canWrite
							? "Add your first staff member to start assigning them to services and locations."
							: "This vendor has no staff configured yet. Ask an owner or manager to add one."
					}
					action={
						canWrite
							? {
									label: "New Staff Member",
									onClick: () => router.push("/staff/new"),
								}
							: undefined
					}
				/>
			) : (
				<>
					<DataTable
						columns={columns}
						data={staff}
						isLoading={isLoading}
						rowId="id"
					/>
					<div className="flex items-center justify-between pt-2">
						<span className="text-sm text-muted-foreground">
							Total: {staff.length}{" "}
							{staff.length === 1 ? "staff member" : "staff members"}
						</span>
					</div>
				</>
			)}
		</div>
	);
}
