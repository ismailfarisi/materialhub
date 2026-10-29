"use client";

import {
	APPLICATION_STATUS_STYLE,
	COLLAB_STATUS_STYLE,
	COLLAB_TYPE_LABEL,
	type CollabApplication,
	type CollabOpportunity,
	useCancelCollab,
	useCollab,
	useCollabApplicationAction,
	useCollabEvents,
	usePublishCollab,
} from "@/lib/queries/collabs";
import { formatAED } from "@/lib/queries/creator-content";
import { Avatar, AvatarFallback, AvatarImage } from "@materialhub/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

function initials(name: string): string {
	return name
		.split(" ")
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function when(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleString("en-AE", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Fulfilment state for a seeding collab, in the vendor's terms.
 *
 * Note there is no address here and never will be: the API sends `has_address`
 * only. The vendor needs to know whether they can ship, not where the creator
 * lives.
 */
function seedingStage(a: CollabApplication): string {
	if (a.received_at) return "Received";
	if (a.shipped_at) return "In transit";
	if (a.has_address) return "Ready to ship";
	return "Awaiting address";
}

export default function CollabDetailPage() {
	const params = useParams<{ id: string }>();
	const id = params.id;
	const { data, isLoading } = useCollab(id);
	const events = useCollabEvents(id);
	const publish = usePublishCollab();
	const cancel = useCancelCollab();
	const act = useCollabApplicationAction();
	const [error, setError] = useState<string | null>(null);
	const [noteFor, setNoteFor] = useState<string | null>(null);
	const [note, setNote] = useState("");

	async function run(fn: () => Promise<unknown>) {
		setError(null);
		try {
			await fn();
		} catch (e: unknown) {
			setError(
				(e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
					(e as Error).message,
			);
		}
	}

	if (isLoading || !data) return <p className="text-sm text-neutral-500">Loading…</p>;

	const opp: CollabOpportunity = data.opportunity;
	const apps = data.applications;
	const isSeeding = opp.type === "product_seeding";
	const isEscrowed = opp.type !== "product_seeding";

	return (
		<div className="space-y-6">
			<Link href="/collabs" className="text-sm text-neutral-600 hover:underline">
				← All collaborations
			</Link>

			<div className="flex items-start justify-between">
				<div>
					<h1 className="text-2xl font-semibold">{opp.title}</h1>
					<p className="mt-1 text-sm text-neutral-500">
						{COLLAB_TYPE_LABEL[opp.type]} ·{" "}
						{opp.visibility === "board" ? "Open board" : "Direct invite"} ·{" "}
						{opp.slots_filled}/{opp.slots_total} slots
					</p>
				</div>
				<div className="flex items-center gap-2">
					<span
						className={`rounded-full px-2 py-1 text-xs font-medium ${COLLAB_STATUS_STYLE[opp.status]}`}
					>
						{opp.status}
					</span>
					{opp.status === "draft" && (
						<button
							type="button"
							onClick={() => run(() => publish.mutateAsync(opp.id))}
							className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
						>
							Publish
						</button>
					)}
					{(opp.status === "draft" || opp.status === "open") && (
						<button
							type="button"
							onClick={() => run(() => cancel.mutateAsync(opp.id))}
							className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
						>
							Cancel
						</button>
					)}
				</div>
			</div>

			{error && (
				<div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
			)}

			<p className="whitespace-pre-wrap text-sm text-neutral-700">{opp.description}</p>

			<div className="grid grid-cols-2 gap-4 rounded-lg border border-neutral-200 p-4 text-sm md:grid-cols-4">
				<div>
					<div className="text-xs uppercase text-neutral-500">Offering</div>
					<div>
						{isEscrowed
							? formatAED(opp.fee_fils ? Number(opp.fee_fils) : null)
							: `${opp.seeded_qty ?? 0} units`}
					</div>
				</div>
				<div>
					<div className="text-xs uppercase text-neutral-500">Applications close</div>
					<div>{when(opp.applications_close_at)}</div>
				</div>
				<div>
					<div className="text-xs uppercase text-neutral-500">Content due</div>
					<div>{when(opp.deliver_by)}</div>
				</div>
				{opp.type === "event_appearance" && (
					<div>
						<div className="text-xs uppercase text-neutral-500">Slot</div>
						<div>
							{when(opp.starts_at)} – {when(opp.ends_at)}
						</div>
					</div>
				)}
			</div>

			<section className="space-y-3">
				<h2 className="text-lg font-medium">Creators ({apps.length})</h2>
				{apps.length === 0 ? (
					<p className="text-sm text-neutral-500">
						{opp.visibility === "board"
							? "No applications yet."
							: "No creators invited yet."}
					</p>
				) : (
					<div className="overflow-x-auto rounded-lg border border-neutral-200">
						<table className="w-full text-sm">
							<thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
								<tr>
									<th className="px-4 py-3 font-medium">Creator</th>
									<th className="px-4 py-3 font-medium">Pitch</th>
									{isEscrowed && <th className="px-4 py-3 font-medium">Fee</th>}
									{isSeeding && <th className="px-4 py-3 font-medium">Fulfilment</th>}
									<th className="px-4 py-3 font-medium">Status</th>
									<th className="px-4 py-3 font-medium">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-neutral-100">
								{apps.map((a) => (
									<tr key={a.id} className="align-top hover:bg-neutral-50">
										<td className="px-4 py-3">
											<div className="flex items-center gap-2">
												<Avatar className="h-6 w-6">
													<AvatarImage
														src={a.creator_avatar_url ?? undefined}
														alt={a.creator_name ?? ""}
													/>
													<AvatarFallback className="text-[10px]">
														{a.creator_name ? initials(a.creator_name) : "?"}
													</AvatarFallback>
												</Avatar>
												<span>{a.creator_name ?? a.creator_id.slice(0, 8)}</span>
											</div>
										</td>
										<td className="max-w-xs px-4 py-3 text-neutral-600">{a.pitch ?? "—"}</td>
										{isEscrowed && (
											<td className="px-4 py-3">
												{formatAED(
													Number(a.agreed_fee_fils ?? a.proposed_fee_fils ?? opp.fee_fils ?? 0),
												)}
											</td>
										)}
										{isSeeding && (
											<td className="px-4 py-3">
												<div>{seedingStage(a)}</div>
												{a.tracking_number && (
													<div className="text-xs text-neutral-500">
														{a.carrier} {a.tracking_number}
													</div>
												)}
											</td>
										)}
										<td className="px-4 py-3">
											<span
												className={`rounded-full px-2 py-1 text-xs font-medium ${APPLICATION_STATUS_STYLE[a.status]}`}
											>
												{a.status.replace(/_/g, " ")}
											</span>
											{a.revision_count > 0 && (
												<div className="mt-1 text-xs text-neutral-500">
													{a.revision_count} revision{a.revision_count === 1 ? "" : "s"}
												</div>
											)}
										</td>
										<td className="space-x-2 whitespace-nowrap px-4 py-3">
											{(a.status === "applied" || a.status === "invited") && (
												<>
													<button
														type="button"
														onClick={() =>
															run(() =>
																act.mutateAsync({ id: opp.id, appId: a.id, action: "accept" }),
															)
														}
														className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
													>
														Accept
													</button>
													<button
														type="button"
														onClick={() =>
															run(() =>
																act.mutateAsync({ id: opp.id, appId: a.id, action: "decline" }),
															)
														}
														className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
													>
														Decline
													</button>
												</>
											)}
											{isSeeding && a.status === "accepted" && (
												<button
													type="button"
													disabled={!a.has_address}
													title={
														a.has_address
															? undefined
															: "Waiting for the creator to choose a delivery address"
													}
													onClick={() =>
														run(() =>
															act.mutateAsync({ id: opp.id, appId: a.id, action: "ship" }),
														)
													}
													className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-40"
												>
													Mark shipped
												</button>
											)}
											{a.status === "delivered" && (
												<>
													<button
														type="button"
														onClick={() =>
															run(() =>
																act.mutateAsync({ id: opp.id, appId: a.id, action: "approve" }),
															)
														}
														className="rounded bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-700"
													>
														{isEscrowed ? "Approve and pay" : "Approve"}
													</button>
													<button
														type="button"
														onClick={() => {
															setNoteFor(a.id);
															setNote("");
														}}
														className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
													>
														Request revision
													</button>
												</>
											)}
											{noteFor === a.id && (
												<div className="mt-2 space-y-2">
													<textarea
														className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
														rows={2}
														placeholder="What needs changing?"
														value={note}
														onChange={(e) => setNote(e.target.value)}
													/>
													<button
														type="button"
														disabled={!note.trim()}
														onClick={() =>
															run(async () => {
																await act.mutateAsync({
																	id: opp.id,
																	appId: a.id,
																	action: "revise",
																	note,
																});
																setNoteFor(null);
															})
														}
														className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-40"
													>
														Send
													</button>
												</div>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<section className="space-y-2">
				<h2 className="text-lg font-medium">Activity</h2>
				<ul className="space-y-1 text-sm text-neutral-600">
					{(events.data ?? []).map((e) => (
						<li key={e.id} className="flex gap-3">
							<span className="w-36 shrink-0 text-xs text-neutral-400">
								{when(e.created_at)}
							</span>
							<span>
								<span className="font-medium">{e.event_type.replace(/_/g, " ")}</span>{" "}
								<span className="text-neutral-400">by {e.actor}</span>
								{e.note && <span className="text-neutral-500"> — {e.note}</span>}
							</span>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
