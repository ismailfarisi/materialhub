"use client";

import {
	type LocationMembershipRole,
	type LocationMembershipRow,
	useAddLocationMember,
	useLocationMembers,
	useRemoveLocationMember,
} from "@/lib/queries/location-members";
import { useTeamMembers } from "@/lib/queries/vendor-members";
import {
	Button,
	ConfirmDialog,
	EmptyState,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	toast,
} from "@materialhub/ui";
import { Trash, UsersThree } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

const ROLE_OPTIONS: { value: LocationMembershipRole; label: string }[] = [
	{ value: "manager", label: "Manager" },
	{ value: "admin", label: "Admin" },
];

function errorMessage(err: unknown, fallback: string): string {
	const e = err as { response?: { data?: { message?: string } } };
	return e?.response?.data?.message ?? fallback;
}

// Owner/manager-only screen to grant a vendor team member a per-location
// managing role (task-7-brief.md Part 2). The page that renders this panel
// must gate visibility itself (useCanManageBookings — see
// locations/[id]/edit/page.tsx) — the API 403s a non-owner/manager caller
// anyway, but the brief asks the UI to hide the section entirely rather than
// show it disabled.
export function LocationAdminsPanel({ locationId }: { locationId: string }) {
	const { data: members = [], isLoading: isLoadingMembers } = useLocationMembers(locationId);
	const { data: teamMembers = [], isLoading: isLoadingTeam } = useTeamMembers();
	const addMember = useAddLocationMember(locationId);
	const removeMember = useRemoveLocationMember(locationId);

	const [selectedUserId, setSelectedUserId] = useState("");
	const [selectedRole, setSelectedRole] = useState<LocationMembershipRole>("manager");
	const [pendingRemove, setPendingRemove] = useState<LocationMembershipRow | null>(null);

	// Eligible pickers: an ACTIVE vendor team member (POST 422s anything
	// else — a location grant is a subset of vendor membership, never a
	// backdoor) with an accepted account (a still-pending invite has no
	// user_id yet), not already a location admin here, and not the vendor
	// owner (Minor #3: owners already manage every branch vendor-wide via
	// isVendorManagerRole — granting them a location membership row would be
	// a harmless but confusing no-op, so they're excluded from the picker).
	const eligibleTeamMembers = useMemo(
		() =>
			teamMembers.filter(
				(m) =>
					m.status === "active" &&
					!!m.user_id &&
					m.role !== "owner" &&
					!members.some((existing) => existing.user_id === m.user_id),
			),
		[teamMembers, members],
	);

	async function addAdmin() {
		if (!selectedUserId) return;
		try {
			await addMember.mutateAsync({ user_id: selectedUserId, role: selectedRole });
			toast({ title: "Location admin added" });
			setSelectedUserId("");
			setSelectedRole("manager");
		} catch (err: unknown) {
			toast({
				title: "Could not add location admin",
				description: errorMessage(err, "Please try again."),
				variant: "destructive",
			});
		}
	}

	async function removeAdmin() {
		if (!pendingRemove) return;
		try {
			await removeMember.mutateAsync(pendingRemove.id);
			toast({ title: "Location admin removed" });
		} catch (err: unknown) {
			toast({
				title: "Could not remove location admin",
				description: errorMessage(err, "Please try again."),
				variant: "destructive",
			});
		} finally {
			setPendingRemove(null);
		}
	}

	const isLoading = isLoadingMembers || isLoadingTeam;

	return (
		<div className="space-y-4">
			<p className="text-sm text-taupe">
				A location admin can manage this branch's calendar — walk-ins, blocks,
				completing/no-showing bookings, and drag-to-reschedule — plus this
				branch's staff working hours, time off, and calendar sync, without
				needing owner or manager access to the rest of the vendor account.
				They can't edit offerings, locations, or vendor-wide policies —
				those stay owner/manager-only. "Manager" and "Admin" both grant the
				same access today; the two labels exist for future permission
				distinctions.
			</p>

			<div className="flex items-end gap-2 rounded-lg border border-pearl/28 p-3">
				<div className="flex-1">
					<Label className="mb-1 block text-xs">Team member</Label>
					<Select value={selectedUserId} onValueChange={setSelectedUserId}>
						<SelectTrigger>
							<SelectValue
								placeholder={
									eligibleTeamMembers.length
										? "Select a team member"
										: "No eligible team members"
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{eligibleTeamMembers.map((m) => (
								// biome-ignore lint/style/noNonNullAssertion: filtered to !!m.user_id above
								<SelectItem key={m.id} value={m.user_id!}>
									{m.email} ({m.role})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="w-40">
					<Label className="mb-1 block text-xs">Role</Label>
					<Select
						value={selectedRole}
						onValueChange={(v) => setSelectedRole(v as LocationMembershipRole)}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ROLE_OPTIONS.map((r) => (
								<SelectItem key={r.value} value={r.value}>
									{r.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button
					type="button"
					onClick={addAdmin}
					disabled={!selectedUserId || addMember.isPending}
				>
					Add
				</Button>
			</div>

			{!isLoading && members.length === 0 ? (
				<EmptyState
					icon={<UsersThree size={40} />}
					title="No location admins yet"
					description="Add a team member above to let them manage this branch without full vendor-wide access."
				/>
			) : (
				<div className="rounded-lg border border-pearl/14 divide-y divide-pearl/14">
					{members.map((m) => (
						<div key={m.id} className="flex items-center justify-between px-4 py-3">
							<div>
								<p className="text-sm font-medium">
									{m.user_name ?? m.user_email ?? m.user_id}
								</p>
								<p className="text-xs text-muted-foreground">
									{m.user_email ?? "—"} · {m.role}
								</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								aria-label="Remove location admin"
								onClick={() => setPendingRemove(m)}
								disabled={removeMember.isPending}
							>
								<Trash size={16} />
							</Button>
						</div>
					))}
				</div>
			)}

			<ConfirmDialog
				open={!!pendingRemove}
				title={
					pendingRemove
						? `Remove ${pendingRemove.user_name ?? pendingRemove.user_email ?? "this admin"}?`
						: ""
				}
				description="They'll lose location-admin access to this branch immediately. Their vendor-wide team membership (if any) is unaffected."
				confirmLabel="Remove"
				destructive
				busy={removeMember.isPending}
				onConfirm={removeAdmin}
				onClose={() => setPendingRemove(null)}
			/>
		</div>
	);
}
