"use client";

import {
	COLLAB_TYPE_LABEL,
	useInviteCreators,
	useVendorCollabs,
} from "@/lib/queries/collabs";
import Link from "next/link";
import { useState } from "react";

/**
 * Invite a creator you just found to one of your open collabs.
 *
 * Opened from two places: a UGC card on Creator Content, and a creator card on
 * the Creators directory (/creators) — the directory this was originally the
 * stopgap for. The metrics-driven discovery surface from spec §1-6 (synced
 * follower counts, engagement scoring, Top 10) remains unbuilt.
 *
 * Only `direct` collabs are offered — a board collab is applied to, not invited
 * into, so inviting someone there would bypass the application the board exists
 * to collect.
 */
export function InviteToCollabModal({
	card,
	onClose,
}: {
	// Only the creator's id and name are ever read, so the prop is typed to
	// exactly that: a DiscoveryCard from Creator Content and a
	// CreatorDirectoryCard from the Creators page both satisfy it.
	card: { creator: { id: string; name: string } };
	onClose: () => void;
}) {
	const { data, isLoading } = useVendorCollabs({ status: "open" });
	const invite = useInviteCreators();
	const [selected, setSelected] = useState<string | null>(null);
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	const invitable = (data ?? []).filter((c) => c.visibility === "direct");

	async function submit() {
		if (!selected) return;
		setError(null);
		try {
			await invite.mutateAsync({ id: selected, creatorIds: [card.creator.id], note });
			setDone(true);
		} catch (e: unknown) {
			setError(
				(e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
					(e as Error).message,
			);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
				<div className="flex items-start justify-between">
					<h2 className="text-lg font-medium">Invite {card.creator.name}</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-neutral-400 hover:text-neutral-600"
						aria-label="Close"
					>
						✕
					</button>
				</div>

				{done ? (
					<div className="mt-4 space-y-4">
						<p className="text-sm text-neutral-700">
							Invitation sent. {card.creator.name} will see it in their creator hub.
						</p>
						<button
							type="button"
							onClick={onClose}
							className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
						>
							Done
						</button>
					</div>
				) : (
					<div className="mt-4 space-y-4">
						{isLoading ? (
							<p className="text-sm text-neutral-500">Loading your collaborations…</p>
						) : invitable.length === 0 ? (
							<div className="space-y-3">
								<p className="text-sm text-neutral-600">
									You have no open direct-invite collaborations. Create one to invite
									creators you find here.
								</p>
								<Link
									href="/collabs/new"
									className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
								>
									New collaboration
								</Link>
							</div>
						) : (
							<>
								<div className="space-y-2">
									{invitable.map((c) => (
										<label
											key={c.id}
											className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-3 hover:border-neutral-400"
										>
											<input
												type="radio"
												name="collab"
												className="mt-1"
												checked={selected === c.id}
												onChange={() => setSelected(c.id)}
											/>
											<span>
												<span className="block text-sm font-medium">{c.title}</span>
												<span className="block text-xs text-neutral-500">
													{COLLAB_TYPE_LABEL[c.type]} · {c.slots_filled}/{c.slots_total}{" "}
													slots filled
												</span>
											</span>
										</label>
									))}
								</div>

								{/* The only free text a vendor can put in front of a creator
								    before the collab is accepted — it rides along with the invite
								    notification. There is no reply channel back to the vendor's
								    inbox; the creator answers by accepting or declining. */}
								<div>
									<label
										htmlFor="invite-note"
										className="mb-1 block text-sm text-neutral-700"
									>
										Add a note{" "}
										<span className="text-neutral-400">(optional)</span>
									</label>
									<textarea
										id="invite-note"
										rows={3}
										maxLength={1000}
										value={note}
										onChange={(e) => setNote(e.target.value)}
										placeholder={`Tell ${card.creator.name} why you'd like to work with them.`}
										className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
									/>
									<p className="mt-1 text-xs text-neutral-500">
										Sent with the invitation by email and in their creator hub.
									</p>
								</div>

								{error && (
									<div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
										{error}
									</div>
								)}

								<div className="flex justify-end gap-2">
									<button
										type="button"
										onClick={onClose}
										className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
									>
										Cancel
									</button>
									<button
										type="button"
										disabled={!selected || invite.isPending}
										onClick={submit}
										className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
									>
										{invite.isPending ? "Sending…" : "Send invitation"}
									</button>
								</div>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
