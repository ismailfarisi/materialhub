"use client";

import { CalendarSyncPanel } from "@/components/bookings/CalendarSyncPanel";
import { StaffLinksPanel } from "@/components/bookings/StaffLinksPanel";
import { StaffProfileForm } from "@/components/bookings/StaffProfileForm";
import { TimeOffPanel } from "@/components/bookings/TimeOffPanel";
import { WeeklyHoursEditor } from "@/components/bookings/WeeklyHoursEditor";
import { useCanManageAtLocation, useCanManageBookings } from "@/hooks/use-vendor-role";
import { useVendorLocations } from "@/lib/queries/locations";
import { useVendorServices } from "@/lib/queries/offerings";
import {
	useLinkStaffLocation,
	useLinkStaffService,
	useStaffLocationLinks,
	useStaffServiceLinks,
	useUnlinkStaffLocation,
	useUnlinkStaffService,
	useVendorStaffMember,
} from "@/lib/queries/staff";
import { Button, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@materialhub/ui";
import { ListChecks, MapPin } from "@phosphor-icons/react";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const STAFF_STATUS_COLORS: Record<string, string> = {
	active: "bg-amber/10 text-amber border border-amber/30",
	inactive: "bg-pearl/20 text-taupe border border-pearl/30",
};

export default function StaffDetailPage() {
	const params = useParams<{ id: string }>();
	const staffId = params.id;
	const { data: staff, isLoading, isError } = useVendorStaffMember(staffId);
	// Profile + the Locations/Services link tabs stay owner|manager-only (spec:
	// no policy edits for location roles — linking a staff member to a branch
	// or service is a vendor-wide catalog decision, not day-to-day schedule
	// management).
	const canWrite = useCanManageBookings();

	const { data: locations = [], isLoading: isLoadingLocations } = useVendorLocations();
	const { data: offerings = [], isLoading: isLoadingOfferings } = useVendorServices();

	// Fix-cycle-1 finding I-3 — real persisted link state (was session-local).
	const { data: linkedLocations = [], isLoading: isLoadingLinkedLocations } =
		useStaffLocationLinks(staffId);
	const { data: linkedServices = [], isLoading: isLoadingLinkedServices } =
		useStaffServiceLinks(staffId);
	const linkedLocationIds = useMemo(
		() => new Set(linkedLocations.map((l) => l.id)),
		[linkedLocations],
	);
	const linkedLocationIdList = useMemo(
		() => linkedLocations.map((l) => l.id),
		[linkedLocations],
	);
	// Task 7 fix cycle, Important #2 — Weekly Hours / Time Off / Calendar Sync
	// are day-to-day schedule management, so a location-admin who manages ANY
	// location this staff member is linked to can write here too (matches the
	// backend's assertStaffAccess -> isLocationManagerOfAny in
	// calendar-subscription.service.ts / calendar-feed-url.service.ts — "any
	// of the staff member's linked locations unlocks").
	const canManageSchedule = useCanManageAtLocation(linkedLocationIdList);
	const linkedServiceIds = useMemo(
		() => new Set(linkedServices.map((s) => s.id)),
		[linkedServices],
	);

	const linkLocation = useLinkStaffLocation(staffId);
	const unlinkLocation = useUnlinkStaffLocation(staffId);
	const linkService = useLinkStaffService(staffId);
	const unlinkService = useUnlinkStaffService(staffId);

	const locationItems = useMemo(
		() => locations.map((l) => ({ id: l.id, label: l.name, sublabel: l.timezone })),
		[locations],
	);
	const serviceItems = useMemo(
		() =>
			offerings.map((o) => ({
				id: o.id,
				label: o.name,
				sublabel: `AED ${(o.price_fils / 100).toFixed(2)} · ${o.duration_minutes} min`,
			})),
		[offerings],
	);

	if (isLoading) {
		return <div className="p-6 text-sm text-taupe">Loading…</div>;
	}

	if (!staff || isError) {
		return (
			<div className="space-y-4">
				<h1 className="text-2xl font-bold text-cacao">Staff member not found</h1>
				<p className="text-sm text-taupe">
					This staff member doesn't exist, or belongs to a different vendor.
				</p>
				<Button asChild variant="outline">
					<a href="/staff">Back to Staff</a>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<div className="flex items-center gap-2">
					<h1 className="text-2xl font-bold text-cacao">{staff.name}</h1>
					<StatusBadge
						status={staff.is_active ? "active" : "inactive"}
						colorMap={STAFF_STATUS_COLORS}
					/>
				</div>
				<p className="text-sm text-taupe">
					Manage this staff member's profile, branches, services, and schedule.
				</p>
			</div>

			<Tabs defaultValue="profile">
				<TabsList className="flex-wrap h-auto">
					<TabsTrigger value="profile">Profile</TabsTrigger>
					<TabsTrigger value="locations">Locations</TabsTrigger>
					<TabsTrigger value="services">Services</TabsTrigger>
					<TabsTrigger value="hours">Weekly Hours</TabsTrigger>
					<TabsTrigger value="time-off">Time Off</TabsTrigger>
					<TabsTrigger value="calendar-sync">Calendar Sync</TabsTrigger>
				</TabsList>

				<TabsContent value="profile">
					<StaffProfileForm staff={staff} canWrite={canWrite} />
				</TabsContent>

				<TabsContent value="locations">
					<StaffLinksPanel
						title="Locations"
						icon={<MapPin size={40} />}
						emptyDescription="This vendor has no locations to link yet."
						items={locationItems}
						linkedIds={linkedLocationIds}
						isLoading={isLoadingLocations || isLoadingLinkedLocations}
						canWrite={canWrite}
						onLink={(id) => linkLocation.mutateAsync(id)}
						onUnlink={(id) => unlinkLocation.mutateAsync(id)}
					/>
				</TabsContent>

				<TabsContent value="services">
					<StaffLinksPanel
						title="Services"
						icon={<ListChecks size={40} />}
						emptyDescription="This vendor has no services to link yet."
						items={serviceItems}
						linkedIds={linkedServiceIds}
						isLoading={isLoadingOfferings || isLoadingLinkedServices}
						canWrite={canWrite}
						onLink={(id) => linkService.mutateAsync(id)}
						onUnlink={(id) => unlinkService.mutateAsync(id)}
					/>
				</TabsContent>

				<TabsContent value="hours">
					<WeeklyHoursEditor staffId={staffId} locations={locations} canWrite={canManageSchedule} />
				</TabsContent>

				<TabsContent value="time-off">
					<TimeOffPanel staffId={staffId} canWrite={canManageSchedule} />
				</TabsContent>

				<TabsContent value="calendar-sync">
					<CalendarSyncPanel staffId={staffId} canWrite={canManageSchedule} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
