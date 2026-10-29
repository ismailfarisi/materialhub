"use client";

import { useEffect, useMemo, useState } from "react";
import { useCanManageAtLocation } from "@/hooks/use-vendor-role";
import { useVendorLocations } from "@/lib/queries/locations";
import { useVendorServices } from "@/lib/queries/offerings";
import { useStaffLocationsIndex, useVendorStaff } from "@/lib/queries/staff";
import {
	type CalendarEngagement,
	useCalendar,
	useRescheduleBooking,
} from "@/lib/queries/calendar";
import {
	addDaysToDateKey,
	formatFullDateInZone,
	startOfWeekKey,
	todayKeyInZone,
	wallClockInZoneToIso,
} from "@/lib/booking/tz";
import { EmptyState, Skeleton, toast } from "@materialhub/ui";
import { CalendarBlank, UsersThree } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { CalendarToolbar, type CalendarView } from "./CalendarToolbar";
import { CalendarLegend } from "./CalendarLegend";
import { ConflictBanner } from "./ConflictBanner";
import { DayGrid } from "./DayGrid";
import { WeekGrid } from "./WeekGrid";
import { WalkInDialog, type WalkInDialogPrefill } from "./WalkInDialog";
import { BlockTimeDialog, type BlockDialogPrefill } from "./BlockTimeDialog";
import { RescheduleConfirmDialog, type PendingReschedule } from "./RescheduleConfirmDialog";

const DEFAULT_TIMEZONE = "Asia/Dubai";

function useNowIso(intervalMs: number): string {
	const [now, setNow] = useState(() => new Date().toISOString());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date().toISOString()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}

export function CalendarBoard() {
	const nowIso = useNowIso(60_000);
	const router = useRouter();

	const { data: locations = [], isLoading: locationsLoading } = useVendorLocations();
	const { data: allStaff = [], isLoading: staffLoading } = useVendorStaff();
	const { data: services = [] } = useVendorServices();

	const activeLocations = useMemo(() => locations.filter((l) => l.is_active), [locations]);
	const activeStaff = useMemo(() => allStaff.filter((s) => s.is_active), [allStaff]);

	const [selectedLocationId, setSelectedLocationId] = useState<string | undefined>(undefined);
	useEffect(() => {
		if (!selectedLocationId && activeLocations.length > 0) {
			setSelectedLocationId(activeLocations[0].id);
		}
	}, [activeLocations, selectedLocationId]);

	const selectedLocation = activeLocations.find((l) => l.id === selectedLocationId);
	const timezone = selectedLocation?.timezone || DEFAULT_TIMEZONE;

	// Task 7 fix cycle, Important #2 — a location-admin (per-location managing
	// membership, not vendor-wide owner|manager) can now use every write
	// affordance below (walk-in create, block create/delete, complete,
	// no-show, drag-reschedule) for their OWN branch, keyed to whichever
	// location is currently selected. Every downstream consumer of `canWrite`
	// (CalendarToolbar's new-walk-in/new-block buttons, DayGrid/WeekGrid cell
	// clicks + drag-reschedule, EngagementDetailPopover's complete/no-show/
	// delete-block actions) already threads this single flag, so gating it
	// here covers the whole calendar surface.
	const canWrite = useCanManageAtLocation(selectedLocationId);

	// Which staff are actually linked to the selected location — the manual
	// booking/block routes 400 ("Staff member is not linked to this
	// location") if not, and there's no reverse "staff at location" endpoint
	// (see Task 5's disclosed gap), so this fans out one per-staff query.
	const staffIds = useMemo(() => activeStaff.map((s) => s.id), [activeStaff]);
	const linkResults = useStaffLocationsIndex(staffIds);
	const linksLoading = linkResults.some((r) => r.isLoading);
	// Fix cycle 1 (Minor 3): while the links index is still resolving, we
	// don't yet know which staff belong to this location — falling back to
	// "all staff" would transiently show wrong-location staff in the grid
	// columns AND offer them in the walk-in/block create dialogs, and a fast
	// create against one of them 400s. Render nothing here; callers show a
	// loading state instead (never all-staff) until this resolves.
	const staffAtLocation = useMemo(() => {
		if (!selectedLocationId || linksLoading) return [];
		return activeStaff.filter((_, i) => (linkResults[i]?.data ?? []).some((l) => l.id === selectedLocationId));
	}, [activeStaff, linkResults, linksLoading, selectedLocationId]);

	const staffById = useMemo(() => new Map(allStaff.map((s) => [s.id, s.name])), [allStaff]);

	const [view, setView] = useState<CalendarView>("day");
	const [dateKey, setDateKey] = useState(() => todayKeyInZone(DEFAULT_TIMEZONE));
	const [staffFilterId, setStaffFilterId] = useState(""); // day view: "" = all

	// Week view has no "all staff" option — default to the first available.
	useEffect(() => {
		if (view === "week" && !staffFilterId && staffAtLocation.length > 0) {
			setStaffFilterId(staffAtLocation[0].id);
		}
	}, [view, staffFilterId, staffAtLocation]);

	// Reset an out-of-scope staff filter when the location changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reacts only to staffAtLocation changing, not to view/staffFilterId themselves (would loop).
	useEffect(() => {
		if (staffFilterId && !staffAtLocation.some((s) => s.id === staffFilterId)) {
			setStaffFilterId(view === "week" ? (staffAtLocation[0]?.id ?? "") : "");
		}
	}, [staffAtLocation]);

	const weekStartKey = useMemo(() => startOfWeekKey(dateKey), [dateKey]);

	const { from, to } = useMemo(() => {
		if (view === "day") {
			return {
				from: wallClockInZoneToIso(dateKey, 0, timezone),
				to: wallClockInZoneToIso(addDaysToDateKey(dateKey, 1), 0, timezone),
			};
		}
		return {
			from: wallClockInZoneToIso(weekStartKey, 0, timezone),
			to: wallClockInZoneToIso(addDaysToDateKey(weekStartKey, 7), 0, timezone),
		};
	}, [view, dateKey, weekStartKey, timezone]);

	const calendarQuery = useCalendar(
		selectedLocationId
			? {
					from,
					to,
					vendorLocationId: selectedLocationId,
					staffMemberId: staffFilterId || undefined,
				}
			: undefined,
	);
	const engagements = calendarQuery.data ?? [];

	const dayColumns = staffFilterId
		? staffAtLocation.filter((s) => s.id === staffFilterId)
		: staffAtLocation;

	const conflicts = useMemo(() => engagements.filter((e) => e.status === "conflicted"), [engagements]);

	// ── Create dialogs ────────────────────────────────────────────────────
	const [walkInOpen, setWalkInOpen] = useState(false);
	const [walkInPrefill, setWalkInPrefill] = useState<WalkInDialogPrefill | null>(null);
	const [blockOpen, setBlockOpen] = useState(false);
	const [blockPrefill, setBlockPrefill] = useState<BlockDialogPrefill | null>(null);

	function openWalkInFromToolbar() {
		setWalkInPrefill(null);
		setWalkInOpen(true);
	}
	function openBlockFromToolbar() {
		setBlockPrefill(null);
		setBlockOpen(true);
	}
	function handleCellClick(staffId: string, startIso: string) {
		setWalkInPrefill({ staffId, startIso });
		setWalkInOpen(true);
	}

	// ── Drag-to-reschedule ───────────────────────────────────────────────
	const rescheduleMutation = useRescheduleBooking();
	const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);

	function handleDropReschedule(
		engagement: CalendarEngagement,
		targetKeyOrStaffId: string,
		newStartIso: string,
		newEndIso: string,
	) {
		// Walk-in/phone CAN be picked up (EngagementBlock registers them as
		// drag-attemptable) so the vendor gets this explain-and-revert on drop,
		// rather than a gesture that silently does nothing — server would 422
		// manual-source anyway, but there's no reason to round-trip for it.
		if (engagement.kind === "walk_in" || engagement.kind === "phone") {
			toast({
				title: "Can't move this booking",
				description: "Walk-in and phone bookings can't be dragged to reschedule — cancel and recreate instead.",
				variant: "destructive",
			});
			return;
		}
		if (engagement.kind !== "marketplace_booking") {
			return; // external_import/manual_block/break never register as draggable — belt-and-suspenders
		}
		// A non-confirmed marketplace booking (in-checkout hold, mid-conflict)
		// still opens the confirm dialog — the server is the real gate
		// (422 invalid_booking_transition), surfaced via the generic catch
		// branch in confirmReschedule() below.
		const targetStaffId = view === "day" ? targetKeyOrStaffId : engagement.staff_member_id;
		setPendingReschedule({
			engagement,
			newStartIso,
			newEndIso,
			targetStaffId,
			targetStaffName: staffById.get(targetStaffId) ?? "",
		});
	}

	async function confirmReschedule() {
		const booking = pendingReschedule?.engagement.booking;
		if (!pendingReschedule || !booking) return;
		const { engagement, newStartIso, newEndIso, targetStaffId } = pendingReschedule;
		try {
			await rescheduleMutation.mutateAsync({
				bookingId: booking.id,
				starts_at: newStartIso,
				ends_at: newEndIso,
				staff_member_id: targetStaffId !== engagement.staff_member_id ? targetStaffId : undefined,
			});
			toast({ title: "Booking rescheduled" });
			setPendingReschedule(null);
		} catch (err: unknown) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			if (e?.response?.status === 409) {
				toast({
					title: "That slot is no longer available",
					description: "Someone else took it — pick another time.",
					variant: "destructive",
				});
			} else if (booking.location_id === null) {
				toast({
					title: "Can't move a home-visit booking",
					description: "Cancel and recreate it with the new time instead.",
					variant: "destructive",
				});
			} else {
				toast({
					title: "Could not reschedule",
					description: e?.response?.data?.message ?? "Please try again.",
					variant: "destructive",
				});
			}
			setPendingReschedule(null);
		}
	}

	// ── Navigation ───────────────────────────────────────────────────────
	function goPrev() {
		setDateKey((k) => addDaysToDateKey(k, view === "day" ? -1 : -7));
	}
	function goNext() {
		setDateKey((k) => addDaysToDateKey(k, view === "day" ? 1 : 7));
	}
	function goToday() {
		setDateKey(todayKeyInZone(timezone));
	}

	const rangeLabel =
		view === "day"
			? formatFullDateInZone(wallClockInZoneToIso(dateKey, 12 * 60, timezone), timezone)
			: `${formatFullDateInZone(wallClockInZoneToIso(weekStartKey, 12 * 60, timezone), timezone).split(",")[0]} – week of ${weekStartKey}`;

	if (locationsLoading || staffLoading) {
		return <div className="p-6 text-sm text-taupe">Loading…</div>;
	}

	if (activeLocations.length === 0) {
		return (
			<EmptyState
				icon={<CalendarBlank size={40} />}
				title="Add a location first"
				description="The calendar needs at least one active location to show a schedule."
				action={{ label: "Go to Locations", onClick: () => router.push("/locations") }}
			/>
		);
	}

	if (activeStaff.length === 0) {
		return (
			<EmptyState
				icon={<UsersThree size={40} />}
				title="Add staff first"
				description="The calendar shows time by staff member — add at least one to get started."
				action={{ label: "Go to Staff", onClick: () => router.push("/staff") }}
			/>
		);
	}

	return (
		<div className="space-y-4">
			<CalendarToolbar
				view={view}
				onViewChange={setView}
				rangeLabel={rangeLabel}
				onPrev={goPrev}
				onNext={goNext}
				onToday={goToday}
				locations={activeLocations}
				selectedLocationId={selectedLocationId}
				onLocationChange={setSelectedLocationId}
				staff={staffAtLocation}
				selectedStaffId={staffFilterId}
				onStaffChange={setStaffFilterId}
				staffFilterRequired={view === "week"}
				canWrite={canWrite}
				onNewWalkIn={openWalkInFromToolbar}
				onNewBlock={openBlockFromToolbar}
			/>

			<ConflictBanner conflicts={conflicts} timezone={timezone} staffNameById={staffById} />

			{linksLoading ? (
				<div
					className="flex border border-pearl/24 rounded-xs overflow-hidden bg-background p-3 gap-3"
					aria-busy="true"
					aria-label="Loading staff for this location"
				>
					{["a", "b", "c"].map((skeletonKey) => (
						<div key={skeletonKey} className="flex-1 min-w-[150px] space-y-2">
							<Skeleton className="h-6 w-2/3" />
							<Skeleton className="h-40 w-full" />
						</div>
					))}
				</div>
			) : staffAtLocation.length === 0 ? (
				<EmptyState
					icon={<UsersThree size={40} />}
					title="No staff at this location"
					description="Link a staff member to this location to see them on the calendar."
					action={{ label: "Go to Staff", onClick: () => router.push("/staff") }}
				/>
			) : view === "day" ? (
				<DayGrid
					dateKey={dateKey}
					staffList={dayColumns}
					engagements={engagements}
					timezone={timezone}
					canWrite={canWrite}
					onCellClick={handleCellClick}
					onDropReschedule={handleDropReschedule}
					nowIso={nowIso}
				/>
			) : (
				<WeekGrid
					weekStartKey={weekStartKey}
					engagements={engagements}
					timezone={timezone}
					canWrite={canWrite}
					onCellClick={(_dateKey, startIso) =>
						handleCellClick(staffFilterId, startIso)
					}
					onDropReschedule={handleDropReschedule}
					nowIso={nowIso}
				/>
			)}

			<CalendarLegend />

			<WalkInDialog
				open={walkInOpen}
				onOpenChange={setWalkInOpen}
				timezone={timezone}
				vendorLocationId={selectedLocationId}
				staffOptions={staffAtLocation}
				services={services}
				prefill={walkInPrefill}
			/>
			<BlockTimeDialog
				open={blockOpen}
				onOpenChange={setBlockOpen}
				timezone={timezone}
				vendorLocationId={selectedLocationId}
				staffOptions={staffAtLocation}
				prefill={blockPrefill}
			/>
			<RescheduleConfirmDialog
				pending={pendingReschedule}
				timezone={timezone}
				busy={rescheduleMutation.isPending}
				onConfirm={confirmReschedule}
				onClose={() => setPendingReschedule(null)}
			/>
		</div>
	);
}
