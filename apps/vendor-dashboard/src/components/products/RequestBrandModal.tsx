"use client";

import { api } from "@/lib/api";
import { useState } from "react";

export interface RequestedBrand {
	id: string;
	name: string;
	status?: "pending" | "approved" | "rejected";
}

/**
 * Ask for a brand the catalogue is missing.
 *
 * Vendors can't create catalogue data, but they hit a wall when the brand they
 * sell isn't in the picker. This submits it for admin review and hands the new
 * brand straight back so the product form can select it — the vendor is not
 * blocked while the review happens, the brand is simply invisible on the
 * storefront until it's approved.
 *
 * Submitting a name that already exists returns the existing brand rather than
 * creating a duplicate, so "request" is safe to press on a brand that turns out
 * to be there under a spelling the search missed.
 */
export function RequestBrandModal({
	initialName,
	onClose,
	onCreated,
}: {
	/** Prefilled from whatever the vendor typed into the brand search. */
	initialName?: string;
	onClose: () => void;
	onCreated: (brand: RequestedBrand) => void;
}) {
	const [name, setName] = useState(initialName ?? "");
	const [website, setWebsite] = useState("");
	const [description, setDescription] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submit() {
		const trimmed = name.trim();
		if (!trimmed) return;
		setSaving(true);
		setError(null);
		try {
			const res = await api.post("/vendor/brands", {
				name: trimmed,
				website_url: website.trim() || undefined,
				description: description.trim() || undefined,
			});
			onCreated(res.data.data as RequestedBrand);
		} catch (e: unknown) {
			setError(
				(e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
					(e as Error).message,
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
				<div className="flex items-start justify-between">
					<h2 className="text-lg font-medium">Request a brand</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-neutral-400 hover:text-neutral-600"
						aria-label="Close"
					>
						✕
					</button>
				</div>

				<p className="mt-2 text-sm text-neutral-600">
					An admin reviews new brands. You can select this one and publish products
					against it right away — it just won't appear on the storefront until it's
					approved.
				</p>

				<div className="mt-4 space-y-3">
					<div>
						<label htmlFor="request-brand-name" className="text-sm font-medium">
							Brand name
						</label>
						<input
							id="request-brand-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							maxLength={200}
							placeholder="e.g. your mill or house brand"
							className="mt-1 w-full rounded border px-3 py-2 text-sm"
						/>
					</div>
					<div>
						<label htmlFor="request-brand-website" className="text-sm font-medium">
							Website <span className="text-neutral-400">(optional)</span>
						</label>
						<input
							id="request-brand-website"
							value={website}
							onChange={(e) => setWebsite(e.target.value)}
							maxLength={512}
							placeholder="https://…"
							className="mt-1 w-full rounded border px-3 py-2 text-sm"
						/>
					</div>
					<div>
						<label htmlFor="request-brand-description" className="text-sm font-medium">
							What do they make? <span className="text-neutral-400">(optional)</span>
						</label>
						<textarea
							id="request-brand-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
							maxLength={2000}
							className="mt-1 w-full rounded border px-3 py-2 text-sm"
						/>
					</div>

					{error && <p className="text-sm text-red-600">{error}</p>}

					<div className="flex gap-2 pt-1">
						<button
							type="button"
							disabled={saving || name.trim() === ""}
							onClick={submit}
							className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
						>
							{saving ? "Submitting…" : "Submit for review"}
						</button>
						<button
							type="button"
							onClick={onClose}
							className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
