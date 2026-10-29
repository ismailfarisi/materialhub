"use client";

import {
	useCalendarSubscription,
	useDeleteCalendarSubscription,
	useIssueCalendarFeedUrl,
	useUpsertCalendarSubscription,
} from "@/lib/queries/calendar-sync";
import { Button, ConfirmDialog, Input, Label, toast } from "@materialhub/ui";
import { CalendarBlank, Copy, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";

// Relative-time formatting mirrors the existing
// components/integrations/IntegrationsList.tsx `timeAgo` helper (same
// "last synced" shape as this panel's inbound status row) — not extracted to
// a shared util since it's a two-line pure function used in exactly one other
// place.
function timeAgo(iso: string | null): string {
	if (!iso) return "never";
	const ageMs = Date.now() - new Date(iso).getTime();
	if (ageMs < 60_000) return "just now";
	const mins = Math.floor(ageMs / 60_000);
	if (mins < 60) return `${mins} min ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs} hr ago`;
	return `${Math.floor(hrs / 24)} d ago`;
}

function errorMessage(err: unknown, fallback: string): string {
	const e = err as { response?: { data?: { message?: string } } };
	return e?.response?.data?.message ?? fallback;
}

// Per-staff calendar sync: inbound iCal subscription (import blocks from the
// vendor's other platform into this staff member's MaterialHub calendar) +
// outbound feed URL (publish this staff member's MaterialHub calendar for the
// vendor's other platform to subscribe to). Writes are gated by
// useCanManageBookings() (same owner|manager gate as the rest of this staff
// detail page) — the backend enforces this independently via
// vendorMembership("products.write") + the staff's linked-locations check.
export function CalendarSyncPanel({ staffId, canWrite }: { staffId: string; canWrite: boolean }) {
	const { data: subscription, isLoading } = useCalendarSubscription(staffId);
	const upsertSubscription = useUpsertCalendarSubscription(staffId);
	const deleteSubscription = useDeleteCalendarSubscription(staffId);
	const issueFeedUrl = useIssueCalendarFeedUrl(staffId);

	const [urlDraft, setUrlDraft] = useState("");
	const [editingUrl, setEditingUrl] = useState(false);
	const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
	const [feedUrl, setFeedUrl] = useState<string | null>(null);

	function startEditing() {
		setUrlDraft(subscription?.ical_url ?? "");
		setEditingUrl(true);
	}

	async function saveSubscription() {
		const url = urlDraft.trim();
		if (!url) {
			toast({ title: "Enter a calendar URL", variant: "destructive" });
			return;
		}
		try {
			await upsertSubscription.mutateAsync(url);
			toast({ title: "Calendar subscription saved" });
			setEditingUrl(false);
		} catch (err: unknown) {
			const e = err as { response?: { status?: number } };
			toast({
				title: "Could not save subscription",
				description:
					e?.response?.status === 400
						? "That link must be a public calendar link (https recommended) — private or internal addresses aren't allowed."
						: errorMessage(err, "Please try again."),
				variant: "destructive",
			});
		}
	}

	async function confirmRemove() {
		try {
			await deleteSubscription.mutateAsync();
			toast({ title: "Calendar subscription removed" });
		} catch (err: unknown) {
			toast({
				title: "Could not remove subscription",
				description: errorMessage(err, "Please try again."),
				variant: "destructive",
			});
		}
	}

	async function handleIssueFeedUrl() {
		try {
			const result = await issueFeedUrl.mutateAsync();
			setFeedUrl(result.url);
		} catch (err: unknown) {
			toast({
				title: "Could not issue feed URL",
				description: errorMessage(err, "Please try again."),
				variant: "destructive",
			});
		}
	}

	function copyFeedUrl() {
		if (!feedUrl) return;
		navigator.clipboard.writeText(feedUrl).then(() => {
			toast({ title: "Copied to clipboard" });
		});
	}

	return (
		<div className="space-y-6">
			<div className="rounded-lg border border-pearl/28 bg-pearl/10 p-4 space-y-1.5">
				<p className="text-sm font-medium text-cacao">Sync is one-way in each direction</p>
				<p className="text-sm text-taupe">
					Importing events from another calendar and publishing this feed are two
					separate, independent flows — neither one edits the other's source, and
					MaterialHub never pushes changes back to an imported feed. Both directions
					are eventually consistent, not instant: an imported event blocks this
					staff member's slots within ~15 minutes of being added to the source
					calendar, and the vendor's other platform only avoids double-booking this
					staff member if it actually subscribes to the outbound feed below, on its
					own refresh schedule (most calendar apps poll every few hours, not
					instantly).
				</p>
			</div>

			{/* Inbound subscription */}
			<div className="space-y-3">
				<div>
					<h3 className="text-sm font-semibold text-cacao">
						Inbound: import from another calendar
					</h3>
					<p className="text-xs text-taupe">
						Paste a public iCal (.ics) link — Google Calendar, Outlook, or another
						booking platform's export URL. MaterialHub checks it every ~15 minutes and
						blocks this staff member's slots for anything it finds.
					</p>
				</div>

				{isLoading ? (
					<p className="text-sm text-taupe">Loading…</p>
				) : subscription && !editingUrl ? (
					<div className="rounded-lg border border-pearl/14 p-4 space-y-2">
						<p className="font-mono text-xs text-cacao break-all">{subscription.ical_url}</p>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-taupe">
							<span>{subscription.is_active ? "Active" : "Inactive"}</span>
							<span>Last synced: {timeAgo(subscription.last_synced_at)}</span>
							<span>Syncs every ~15 minutes</span>
						</div>
						{subscription.last_sync_error && (
							<div className="flex items-start gap-2 rounded-md border-2 border-russet bg-russet/8 px-3 py-2">
								<WarningCircle size={16} weight="fill" className="text-russet shrink-0 mt-0.5" />
								<p className="text-xs text-russet">{subscription.last_sync_error}</p>
							</div>
						)}
						{canWrite && (
							<div className="flex gap-2 pt-1">
								<Button type="button" variant="outline" size="sm" onClick={startEditing}>
									Change URL
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="text-russet hover:bg-russet/10"
									onClick={() => setConfirmRemoveOpen(true)}
								>
									Remove
								</Button>
							</div>
						)}
					</div>
				) : canWrite ? (
					<div className="flex items-end gap-2 rounded-lg border border-pearl/28 p-3">
						<div className="flex-1">
							<Label className="mb-1 block text-xs">Calendar URL (public link — https recommended)</Label>
							<Input
								type="url"
								placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
								value={urlDraft}
								onChange={(e) => setUrlDraft(e.target.value)}
							/>
						</div>
						<Button
							type="button"
							onClick={saveSubscription}
							disabled={upsertSubscription.isPending}
						>
							{subscription ? "Save" : "Subscribe"}
						</Button>
						{editingUrl && (
							<Button
								type="button"
								variant="outline"
								onClick={() => setEditingUrl(false)}
								disabled={upsertSubscription.isPending}
							>
								Cancel
							</Button>
						)}
					</div>
				) : (
					<p className="text-sm text-taupe">No calendar subscription configured.</p>
				)}
			</div>

			{/* Outbound feed */}
			<div className="space-y-3">
				<div>
					<h3 className="text-sm font-semibold text-cacao">
						Outbound: publish this staff member's calendar
					</h3>
					<p className="text-xs text-taupe">
						Get a link and paste it into Google Calendar / Outlook (or any app
						that can "subscribe to a URL from the internet") on the vendor's other
						platform. It only prevents double-booking there if that platform
						actually subscribes to this link and refreshes it on its own schedule —
						MaterialHub cannot push updates to it directly. This link stays valid
						until the platform rotates its signing secret — asking for it again
						below returns the SAME link, it doesn't invalidate a previous copy. If
						this link leaks, contact support.
					</p>
				</div>

				{canWrite ? (
					<div className="space-y-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleIssueFeedUrl}
							disabled={issueFeedUrl.isPending}
						>
							<CalendarBlank size={14} className="mr-1.5" />
							{feedUrl ? "Show feed URL" : "Get feed link"}
						</Button>
						{feedUrl && (
							<div className="flex items-center gap-3">
								<code className="flex-1 rounded-md border border-pearl/14 bg-pearl/30 px-3 py-2 font-mono text-xs text-cacao break-all">
									{feedUrl}
								</code>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={copyFeedUrl}
									className="shrink-0 gap-1.5"
								>
									<Copy size={13} />
									Copy
								</Button>
							</div>
						)}
					</div>
				) : (
					<p className="text-sm text-taupe">
						You don't have permission to get this link — ask an owner, manager, or
						this branch's location admin.
					</p>
				)}
			</div>

			<ConfirmDialog
				open={confirmRemoveOpen}
				title="Remove calendar subscription?"
				description="This stops future imports AND immediately releases every slot this feed has already blocked on this staff member's calendar — those slots become bookable again right away. This can't be undone from here; you'll need to re-subscribe and wait ~15 minutes for events to reappear."
				confirmLabel="Remove subscription"
				destructive
				busy={deleteSubscription.isPending}
				onConfirm={confirmRemove}
				onClose={() => setConfirmRemoveOpen(false)}
			/>
		</div>
	);
}
