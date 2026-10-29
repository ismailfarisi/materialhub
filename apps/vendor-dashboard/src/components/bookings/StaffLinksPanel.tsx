"use client";

import { Badge, Button, EmptyState, toast } from "@materialhub/ui";
import { Link as LinkIcon, LinkBreak } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

export interface LinkableItem {
	id: string;
	label: string;
	sublabel?: string;
}

interface StaffLinksPanelProps {
	title: string;
	icon: ReactNode;
	emptyDescription: string;
	items: LinkableItem[];
	/** Ids currently linked, per the server (fix-cycle-1 finding I-3 — was
	 * session-local tracking; now sourced from GET .../:id/locations|services). */
	linkedIds: Set<string>;
	isLoading: boolean;
	canWrite: boolean;
	onLink: (id: string) => Promise<unknown>;
	onUnlink: (id: string) => Promise<unknown>;
}

// Link/unlink staff to a location or an offering. `linkedIds` reflects real
// persisted state (fix-cycle-1 finding I-3 fixed the underlying gap: the
// backend now exposes GET .../:id/locations and GET .../:id/services, so a
// pre-existing link shows as "linked" and unlink is directly reachable —
// no more link-then-unlink workaround). Both link and unlink remain
// server-side idempotent no-ops, and the caller's query hooks invalidate the
// link list on success so this list re-renders from fresh server state.
export function StaffLinksPanel({
	title,
	icon,
	emptyDescription,
	items,
	linkedIds,
	isLoading,
	canWrite,
	onLink,
	onUnlink,
}: StaffLinksPanelProps) {
	const [pendingId, setPendingId] = useState<string | null>(null);

	async function handleLink(id: string) {
		setPendingId(id);
		try {
			await onLink(id);
			toast({ title: "Linked" });
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not link",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		} finally {
			setPendingId(null);
		}
	}

	async function handleUnlink(id: string) {
		setPendingId(id);
		try {
			await onUnlink(id);
			toast({ title: "Unlinked" });
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			toast({
				title: "Could not unlink",
				description: e?.response?.data?.message ?? "Please try again.",
				variant: "destructive",
			});
		} finally {
			setPendingId(null);
		}
	}

	return (
		<div className="space-y-4">
			{!isLoading && items.length === 0 ? (
				<EmptyState icon={icon} title={`No ${title.toLowerCase()} yet`} description={emptyDescription} />
			) : (
				<div className="rounded-lg border border-pearl/14 divide-y divide-pearl/14">
					{items.map((item) => {
						const isLinked = linkedIds.has(item.id);
						const isBusy = pendingId === item.id;
						return (
							<div key={item.id} className="flex items-center justify-between px-4 py-3">
								<div>
									<p className="text-sm font-medium">{item.label}</p>
									{item.sublabel && (
										<p className="text-xs text-muted-foreground">{item.sublabel}</p>
									)}
								</div>
								{canWrite ? (
									<Button
										type="button"
										variant={isLinked ? "outline" : "default"}
										size="sm"
										disabled={isBusy}
										onClick={() => (isLinked ? handleUnlink(item.id) : handleLink(item.id))}
									>
										{isLinked ? (
											<>
												<LinkBreak size={14} className="mr-1" /> Unlink
											</>
										) : (
											<>
												<LinkIcon size={14} className="mr-1" /> Link
											</>
										)}
									</Button>
								) : isLinked ? (
									<Badge variant="secondary">Linked</Badge>
								) : null}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
