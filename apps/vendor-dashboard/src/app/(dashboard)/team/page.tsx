"use client";

import { getMembershipsFromToken } from "@/lib/auth";
import { useResendInvite, useTeamMembers } from "@/lib/queries/vendor-members";
import { useActiveVendor } from "@/stores/active-vendor";
import { Button } from "@materialhub/ui";
import { Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { ChangeRoleModal } from "./_components/change-role-modal";
import { InviteModal } from "./_components/invite-modal";
import { RemoveConfirmModal } from "./_components/remove-confirm-modal";

const FLAG_ENABLED =
	process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED !== "false";

function formatDate(iso: string | null | undefined) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-AE", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export default function TeamPage() {
	const { data: members = [], isLoading, isError, error, refetch } = useTeamMembers();
	const resend = useResendInvite();
	const [inviteOpen, setInviteOpen] = useState(false);
	const [changeRoleTarget, setChangeRoleTarget] = useState<string | null>(null);
	const [removeTarget, setRemoveTarget] = useState<string | null>(null);

	if (!FLAG_ENABLED) {
		return (
			<div className="p-8 text-sm text-zinc-500">
				Team management is not yet available.
			</div>
		);
	}

	const memberships =
		typeof window !== "undefined" ? getMembershipsFromToken() : [];
	// Single-store users have no picker selection; their only membership is active.
	const activeVid =
		useActiveVendor.getState().activeVendorId ??
		(memberships.length === 1 ? memberships[0].vid : null);
	const myRole = memberships.find((m) => m.vid === activeVid)?.r;
	const isOwner = myRole === "owner";

	if (isLoading) {
		return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
	}

	if (isError) {
		const status = (error as { response?: { status?: number } } | null)?.response?.status;
		return (
			<div className="p-8 space-y-3">
				<h1 className="text-2xl font-semibold">Team</h1>
				<p role="alert" className="text-sm text-destructive">
					{status === 403
						? "Your role can't view the team for this store."
						: ((error as { response?: { data?: { message?: string } } } | null)?.response
								?.data?.message ?? "The team could not be loaded.")}
				</p>
				{status !== 403 ? (
					<Button variant="outline" size="sm" onClick={() => void refetch()}>
						Try again
					</Button>
				) : null}
			</div>
		);
	}

	return (
		<div className="p-8">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">Team</h1>
				{isOwner && (
					<Button onClick={() => setInviteOpen(true)}>
						<Plus size={16} className="mr-2" />
						Invite member
					</Button>
				)}
			</div>

			<div className="mt-6 overflow-x-auto">
				<table className="w-full text-sm" data-stack="md">
					<thead className="text-left text-zinc-500 border-b">
						<tr>
							<th className="py-2 px-3 font-medium">Name / Email</th>
							<th className="py-2 px-3 font-medium">Role</th>
							<th className="py-2 px-3 font-medium">Status</th>
							<th className="py-2 px-3 font-medium">Joined / Invited</th>
							<th className="py-2 px-3 text-right font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{members.length === 0 && (
							<tr>
								<td colSpan={5} className="py-8 text-center text-zinc-500">
									No team members yet.
								</td>
							</tr>
						)}
						{members.map((m) => (
							<tr key={m.id} className="border-b">
								<td className="py-3 px-3" data-card-title>
									{m.email}
								</td>
								<td className="py-3 px-3 capitalize" data-label="Role">
									{m.role}
								</td>
								<td className="py-3 px-3" data-label="Status">
									{m.status === "pending" && m.expired ? (
										<span className="text-orange-600">Expired</span>
									) : (
										<span className="capitalize">{m.status}</span>
									)}
								</td>
								<td className="py-3 px-3" data-label="Joined / Invited">
									{formatDate(m.joined_or_invited_at)}
								</td>
								<td className="py-3 px-3 text-right">
									{isOwner && m.role !== "owner" && (
										<div className="flex items-center justify-end gap-3 text-xs">
											{m.status === "pending" && (
												<button
													type="button"
													className="text-blue-600 hover:underline"
													onClick={() => resend.mutate(m.id)}
												>
													Resend
												</button>
											)}
											<button
												type="button"
												className="text-blue-600 hover:underline"
												onClick={() => setChangeRoleTarget(m.id)}
											>
												Change role
											</button>
											<button
												type="button"
												className="text-red-600 hover:underline"
												onClick={() => setRemoveTarget(m.id)}
											>
												Remove
											</button>
										</div>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{members.length > 0 && (
				<div className="mt-2 text-sm text-zinc-500">
					Total: {members.length}{" "}
					{members.length === 1 ? "team member" : "team members"}
				</div>
			)}

			{isOwner && (
				<div className="mt-8">
					<a
						href="/team/transfer-ownership"
						className="text-sm text-zinc-500 hover:underline"
					>
						Transfer ownership →
					</a>
				</div>
			)}

			<InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
			<ChangeRoleModal
				memberId={changeRoleTarget}
				currentRole={members.find((m) => m.id === changeRoleTarget)?.role}
				onClose={() => setChangeRoleTarget(null)}
			/>
			<RemoveConfirmModal
				memberId={removeTarget}
				memberEmail={members.find((m) => m.id === removeTarget)?.email}
				onClose={() => setRemoveTarget(null)}
			/>
		</div>
	);
}
