"use client";

import { EntityCombobox } from "@/components/ui/entity-combobox";
import {
	COLLAB_TYPE_LABEL,
	type CollabType,
	type CreateCollabInput,
	useCreateCollab,
	usePublishCollab,
} from "@/lib/queries/collabs";
import { getVendorProductByIdLookup, searchVendorProductsLookup } from "@/lib/queries/lookups";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TYPES: { type: CollabType; blurb: string }[] = [
	{
		type: "product_seeding",
		blurb: "Send free product in exchange for a post. No payment changes hands.",
	},
	{
		type: "paid_campaign",
		blurb: "Pay a fixed fee for defined deliverables. Funds are held in escrow on accept.",
	},
	{
		type: "event_appearance",
		blurb: "Book a creator for a slot at one of your locations. Escrowed like a campaign.",
	},
];

const field = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-sm font-medium text-neutral-700";

export default function NewCollabPage() {
	const router = useRouter();
	const create = useCreateCollab();
	const publish = usePublishCollab();

	const [type, setType] = useState<CollabType | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState({
		title: "",
		description: "",
		visibility: "board" as "board" | "direct",
		slotsTotal: 1,
		applicationsCloseAt: "",
		deliverBy: "",
		minFollowerCount: "",
		feeFils: "",
		fundingSource: "payout_balance" as "payout_balance" | "stripe",
		seededProductId: null as string | null,
		seededQty: 1,
		locationId: "",
		startsAt: "",
		endsAt: "",
	});

	const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

	async function submit(publishNow: boolean) {
		if (!type) return;
		setError(null);

		const input: CreateCollabInput = {
			type,
			visibility: form.visibility,
			title: form.title,
			description: form.description,
			slotsTotal: Number(form.slotsTotal) || 1,
			// A board collab with no closing date can never expire, so the backend
			// refuses to publish one. Surface that here rather than at publish time.
			applicationsCloseAt: form.applicationsCloseAt
				? new Date(form.applicationsCloseAt).toISOString()
				: null,
			deliverBy: form.deliverBy ? new Date(form.deliverBy).toISOString() : null,
			minFollowerCount: form.minFollowerCount ? Number(form.minFollowerCount) : null,
		};

		if (type === "paid_campaign") {
			input.feeFils = Math.round(Number(form.feeFils) * 100);
			input.fundingSource = form.fundingSource;
		}
		if (type === "product_seeding") {
			input.seededProductId = form.seededProductId;
			input.seededQty = Number(form.seededQty) || 1;
		}
		if (type === "event_appearance") {
			input.locationId = form.locationId || null;
			input.startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : null;
			input.endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : null;
			input.feeFils = Math.round(Number(form.feeFils) * 100);
			input.fundingSource = form.fundingSource;
		}

		try {
			const created = await create.mutateAsync(input);
			if (publishNow) await publish.mutateAsync(created.id);
			router.push(`/collabs/${created.id}`);
		} catch (e: unknown) {
			const detail =
				(e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
				(e as Error).message;
			setError(detail);
		}
	}

	if (!type) {
		return (
			<div className="max-w-2xl space-y-6">
				<div>
					<h1 className="text-2xl font-semibold">New collaboration</h1>
					<p className="text-sm text-neutral-500">What are you offering?</p>
				</div>
				<div className="space-y-3">
					{TYPES.map((t) => (
						<button
							key={t.type}
							type="button"
							onClick={() => setType(t.type)}
							className="w-full rounded-lg border border-neutral-200 p-4 text-left hover:border-neutral-400"
						>
							<div className="font-medium">{COLLAB_TYPE_LABEL[t.type]}</div>
							<div className="text-sm text-neutral-500">{t.blurb}</div>
						</button>
					))}
				</div>
			</div>
		);
	}

	const needsFee = type === "paid_campaign" || type === "event_appearance";
	const busy = create.isPending || publish.isPending;

	return (
		<div className="max-w-2xl space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">{COLLAB_TYPE_LABEL[type]}</h1>
				<button
					type="button"
					onClick={() => setType(null)}
					className="text-sm text-neutral-600 hover:underline"
				>
					Change type
				</button>
			</div>

			{error && (
				<div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
			)}

			<div className="space-y-4">
				<div>
					<label className={label} htmlFor="title">
						Title
					</label>
					<input
						id="title"
						className={field}
						value={form.title}
						onChange={(e) => set({ title: e.target.value })}
						maxLength={200}
					/>
				</div>
				<div>
					<label className={label} htmlFor="description">
						What you want
					</label>
					<textarea
						id="description"
						className={field}
						rows={4}
						value={form.description}
						onChange={(e) => set({ description: e.target.value })}
					/>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className={label} htmlFor="visibility">
							Distribution
						</label>
						<select
							id="visibility"
							className={field}
							value={form.visibility}
							onChange={(e) => set({ visibility: e.target.value as "board" | "direct" })}
						>
							<option value="board">Open board — creators apply</option>
							<option value="direct">Direct invite only</option>
						</select>
					</div>
					<div>
						<label className={label} htmlFor="slots">
							Creators wanted
						</label>
						<input
							id="slots"
							type="number"
							min={1}
							className={field}
							value={form.slotsTotal}
							onChange={(e) => set({ slotsTotal: Number(e.target.value) })}
						/>
					</div>
				</div>

				{form.visibility === "board" && (
					<div>
						<label className={label} htmlFor="closeAt">
							Applications close
						</label>
						<input
							id="closeAt"
							type="datetime-local"
							className={field}
							value={form.applicationsCloseAt}
							onChange={(e) => set({ applicationsCloseAt: e.target.value })}
						/>
						<p className="mt-1 text-xs text-neutral-500">
							Required for board collabs — without it the listing can never close.
						</p>
					</div>
				)}

				{type === "product_seeding" && (
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className={label} htmlFor="product">
								Product
							</label>
							<EntityCombobox
								value={form.seededProductId}
								onChange={(id) => set({ seededProductId: id })}
								search={searchVendorProductsLookup}
								getById={getVendorProductByIdLookup}
								placeholder="Search your products…"
							/>
						</div>
						<div>
							<label className={label} htmlFor="qty">
								Units per creator
							</label>
							<input
								id="qty"
								type="number"
								min={1}
								className={field}
								value={form.seededQty}
								onChange={(e) => set({ seededQty: Number(e.target.value) })}
							/>
						</div>
					</div>
				)}

				{type === "event_appearance" && (
					<>
						<div>
							<label className={label} htmlFor="location">
								Location ID
							</label>
							<input
								id="location"
								className={field}
								value={form.locationId}
								onChange={(e) => set({ locationId: e.target.value })}
							/>
							<p className="mt-1 text-xs text-neutral-500">
								Must be one of your own locations. This does not book staff or affect
								your service availability.
							</p>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className={label} htmlFor="startsAt">
									Starts
								</label>
								<input
									id="startsAt"
									type="datetime-local"
									className={field}
									value={form.startsAt}
									onChange={(e) => set({ startsAt: e.target.value })}
								/>
							</div>
							<div>
								<label className={label} htmlFor="endsAt">
									Ends
								</label>
								<input
									id="endsAt"
									type="datetime-local"
									className={field}
									value={form.endsAt}
									onChange={(e) => set({ endsAt: e.target.value })}
								/>
							</div>
						</div>
					</>
				)}

				{needsFee && (
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className={label} htmlFor="fee">
								Fee per creator (AED)
							</label>
							<input
								id="fee"
								type="number"
								min={0}
								step="0.01"
								className={field}
								value={form.feeFils}
								onChange={(e) => set({ feeFils: e.target.value })}
							/>
							<p className="mt-1 text-xs text-neutral-500">
								Held in escrow when you accept a creator, released if it falls through.
							</p>
						</div>
						<div>
							<label className={label} htmlFor="funding">
								Funded from
							</label>
							<select
								id="funding"
								className={field}
								value={form.fundingSource}
								onChange={(e) =>
									set({ fundingSource: e.target.value as "payout_balance" | "stripe" })
								}
							>
								<option value="payout_balance">Payout balance</option>
								<option value="stripe">Card</option>
							</select>
						</div>
					</div>
				)}

				<div>
					<label className={label} htmlFor="deliverBy">
						Content due
					</label>
					<input
						id="deliverBy"
						type="datetime-local"
						className={field}
						value={form.deliverBy}
						onChange={(e) => set({ deliverBy: e.target.value })}
					/>
					{type === "product_seeding" && (
						<p className="mt-1 text-xs text-neutral-500">
							The clock starts when the creator confirms the product arrived, not when
							you accept them — shipping time does not eat into their window.
						</p>
					)}
				</div>
			</div>

			<div className="flex gap-3">
				<button
					type="button"
					disabled={busy}
					onClick={() => submit(true)}
					className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
				>
					{busy ? "Saving…" : "Create and publish"}
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => submit(false)}
					className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
				>
					Save as draft
				</button>
			</div>
		</div>
	);
}
