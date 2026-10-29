"use client";

import { formatAED } from "@/lib/queries/creator-content";
import {
	type FeaturePlacement,
	type LicenseGrant,
	type LicenseOffer,
	type OfferStatus,
	type RightsScope,
	useAcceptCounter,
	useCancelOffer,
	useGrantFeatures,
	useGrants,
	useMyOffers,
	useOfferEvents,
	usePinFeature,
	useReOffer,
	useRequestDownload,
	useUnpinFeature,
} from "@/lib/queries/licensing";
import { useVendorProducts } from "@/lib/queries/products";
import Link from "next/link";
import { useState } from "react";

const RIGHTS_LABEL: Record<LicenseOffer["rights_scope"], string> = {
	in_platform: "In-platform",
	off_platform: "Off-platform",
	both: "In + off-platform",
};

const FUNDING_LABEL: Record<LicenseOffer["funding_source"], string> = {
	payout_balance: "Payout balance",
	stripe: "Card",
};

const STATUS_STYLE: Record<OfferStatus, string> = {
	pending_creator: "bg-amber-100 text-amber-700",
	countered: "bg-blue-100 text-blue-700",
	completed: "bg-green-100 text-green-700",
	declined: "bg-rose-100 text-rose-700",
	expired: "bg-neutral-100 text-neutral-600",
	cancelled: "bg-neutral-100 text-neutral-600",
};

const STATUS_LABEL: Record<OfferStatus, string> = {
	pending_creator: "Pending creator",
	countered: "Countered",
	completed: "Completed",
	declined: "Declined",
	expired: "Expired",
	cancelled: "Cancelled",
};

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-AE", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

// ── Per-row countered actions ─────────────────────────────────────────────────

function CounteredActions({ offer }: { offer: LicenseOffer }) {
	const cancel = useCancelOffer();
	const acceptCounter = useAcceptCounter();
	const reOffer = useReOffer();

	const [reOfferAed, setReOfferAed] = useState("");
	const [showReOffer, setShowReOffer] = useState(false);
	const [showHistory, setShowHistory] = useState(false);
	const events = useOfferEvents(showHistory ? offer.id : null);

	const isStripe = offer.funding_source === "stripe";
	const busy = cancel.isPending || acceptCounter.isPending || reOffer.isPending;

	function handleAcceptCounter() {
		if (isStripe) return; // gated
		acceptCounter.mutate({ offerId: offer.id });
	}

	function handleReOffer() {
		const aed = Number.parseFloat(reOfferAed);
		if (Number.isNaN(aed) || aed <= 0) return;
		reOffer.mutate(
			{ offerId: offer.id, amount_fils: Math.round(aed * 100) },
			{ onSuccess: () => setShowReOffer(false) },
		);
	}

	return (
		<div className="flex flex-col gap-2 items-end">
			{/* Counter amount hint */}
			<div className="text-xs text-blue-600 font-medium">
				Creator asked {formatAED(Number(offer.amount_fils))}
			</div>

			<div className="flex gap-1 flex-wrap justify-end">
				{/* Accept counter */}
				{isStripe ? (
					<span
						title="Card funding coming soon — use payout balance"
						className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-400 cursor-not-allowed"
					>
						Accept (coming soon)
					</span>
				) : (
					<button
						type="button"
						disabled={busy}
						onClick={handleAcceptCounter}
						className="rounded bg-blue-600 text-white px-2 py-1 text-xs disabled:opacity-50"
					>
						Accept counter
					</button>
				)}

				{/* Re-offer toggle */}
				<button
					type="button"
					disabled={busy}
					onClick={() => setShowReOffer((v) => !v)}
					className="rounded bg-neutral-100 px-2 py-1 text-xs disabled:opacity-50"
				>
					Re-offer
				</button>

				{/* Cancel */}
				<button
					type="button"
					disabled={busy}
					onClick={() => cancel.mutate(offer.id)}
					className="rounded bg-neutral-100 px-2 py-1 text-xs disabled:opacity-50"
				>
					Cancel
				</button>

				{/* History */}
				<button
					type="button"
					onClick={() => setShowHistory((v) => !v)}
					className="rounded bg-neutral-50 border border-neutral-200 px-2 py-1 text-xs"
				>
					History
				</button>
			</div>

			{/* Re-offer inline form */}
			{showReOffer && (
				<div className="flex gap-1 items-center mt-1">
					<span className="text-xs text-neutral-500">AED</span>
					<input
						type="number"
						min="1"
						step="0.01"
						value={reOfferAed}
						onChange={(e) => setReOfferAed(e.target.value)}
						placeholder="amount"
						className="w-24 rounded border border-neutral-300 px-2 py-1 text-xs"
					/>
					<button
						type="button"
						disabled={busy || !reOfferAed}
						onClick={handleReOffer}
						className="rounded bg-neutral-700 text-white px-2 py-1 text-xs disabled:opacity-50"
					>
						Send
					</button>
				</div>
			)}

			{/* History expander */}
			{showHistory && (
				<div className="mt-1 w-full max-w-xs text-xs border border-neutral-100 rounded p-2 bg-neutral-50">
					{events.isLoading && (
						<p className="text-neutral-400">Loading history…</p>
					)}
					{events.data?.length === 0 && (
						<p className="text-neutral-400">No events yet.</p>
					)}
					{events.data?.map((ev) => (
						<div key={ev.id} className="py-0.5 text-neutral-600">
							<span className="font-medium capitalize">{ev.actor}</span>{" "}
							{ev.event_type}
							{ev.amount_fils ? ` — ${formatAED(Number(ev.amount_fils))}` : ""}
							{ev.note ? ` "${ev.note}"` : ""}
							<span className="ml-1 text-neutral-400">
								{formatDate(ev.created_at)}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ── Granted licenses: rights delivery (pin / download) ───────────────────────

const SCOPE_ALLOWS_PIN: Record<RightsScope, boolean> = {
	in_platform: true,
	off_platform: false,
	both: true,
};

const SCOPE_ALLOWS_DOWNLOAD: Record<RightsScope, boolean> = {
	in_platform: false,
	off_platform: true,
	both: true,
};

function GrantPins({ grant }: { grant: LicenseGrant }) {
	const features = useGrantFeatures(grant.id);
	const pin = usePinFeature();
	const unpin = useUnpinFeature();
	const products = useVendorProducts({ status: "published", limit: 100 });

	const [placement, setPlacement] = useState<FeaturePlacement>("storefront");
	const [productId, setProductId] = useState("");

	const productList: Array<{ id: string; name: string }> =
		(
			products.data as
				| { items?: Array<{ id: string; name: string }> }
				| undefined
		)?.items ?? [];

	const canPin =
		placement === "storefront" || (placement === "product" && !!productId);

	function handlePin() {
		if (!canPin) return;
		pin.mutate(
			{
				grantId: grant.id,
				placement,
				product_id: placement === "product" ? productId : undefined,
			},
			{ onSuccess: () => setProductId("") },
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{/* Pin control */}
			<div className="flex flex-wrap items-center gap-1">
				<select
					value={placement}
					onChange={(e) => setPlacement(e.target.value as FeaturePlacement)}
					className="rounded border border-neutral-300 px-2 py-1 text-xs"
				>
					<option value="storefront">Storefront</option>
					<option value="product">Product</option>
				</select>

				{placement === "product" && (
					<select
						value={productId}
						onChange={(e) => setProductId(e.target.value)}
						className="w-44 rounded border border-neutral-300 px-2 py-1 text-xs"
					>
						<option value="">Select a product…</option>
						{productList.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				)}

				<button
					type="button"
					disabled={pin.isPending || !canPin}
					onClick={handlePin}
					className="rounded bg-emerald-600 text-white px-2 py-1 text-xs disabled:opacity-50"
				>
					Pin
				</button>
			</div>

			{/* Current pins */}
			{features.isLoading ? (
				<p className="text-xs text-neutral-400">Loading pins…</p>
			) : (features.data?.length ?? 0) === 0 ? (
				<p className="text-xs text-neutral-400">No pins yet.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{features.data?.map((f) => (
						<li
							key={f.id}
							className="flex items-center justify-between gap-2 text-xs text-neutral-600"
						>
							<span>
								{f.placement === "storefront"
									? "Storefront"
									: `Product ${f.product_id?.slice(0, 8) ?? ""}…`}
							</span>
							<button
								type="button"
								disabled={unpin.isPending}
								onClick={() =>
									unpin.mutate({ featureId: f.id, grantId: grant.id })
								}
								className="rounded bg-neutral-100 px-2 py-0.5 text-xs disabled:opacity-50"
							>
								Unpin
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function GrantDownload({ grant }: { grant: LicenseGrant }) {
	const download = useRequestDownload();
	const [expiresAt, setExpiresAt] = useState<string | null>(null);

	function handleDownload() {
		download.mutate(grant.id, {
			onSuccess: (res) => {
				setExpiresAt(res.expiresAt);
				if (typeof window !== "undefined") window.open(res.url, "_blank");
			},
		});
	}

	return (
		<div className="flex flex-col gap-1 items-start">
			<button
				type="button"
				disabled={download.isPending}
				onClick={handleDownload}
				className="rounded bg-neutral-800 text-white px-2 py-1 text-xs disabled:opacity-50"
			>
				{download.isPending ? "Preparing…" : "Download"}
			</button>
			{expiresAt && (
				<span className="text-[11px] text-neutral-400">
					Link expires {new Date(expiresAt).toLocaleString("en-AE")}
				</span>
			)}
		</div>
	);
}

function GrantsSection() {
	const grants = useGrants();

	return (
		<section className="mt-10">
			<h2 className="mb-3 text-lg font-semibold">Granted licenses</h2>

			{grants.isLoading ? (
				<p className="text-sm text-neutral-500">Loading…</p>
			) : (grants.data?.length ?? 0) === 0 ? (
				<p className="text-sm text-neutral-500">
					No granted licenses yet. Accepted offers appear here for rights
					delivery.
				</p>
			) : (
				<div className="overflow-x-auto rounded-lg border border-neutral-200">
					<table className="w-full text-sm">
						<thead className="bg-neutral-50 text-left text-neutral-600">
							<tr>
								<th className="px-3 py-2 font-medium">Reel</th>
								<th className="px-3 py-2 font-medium">Rights</th>
								<th className="px-3 py-2 font-medium">Granted</th>
								<th className="px-3 py-2 font-medium">Expires</th>
								<th className="px-3 py-2 font-medium">Status</th>
								<th className="px-3 py-2 font-medium">Rights delivery</th>
							</tr>
						</thead>
						<tbody>
							{grants.data?.map((grant) => {
								const inactive = !grant.active;
								return (
									<tr
										key={grant.id}
										className="border-t border-neutral-100 align-top"
									>
										<td className="px-3 py-2 font-mono text-xs text-neutral-500">
											{grant.reel_id.slice(0, 8)}…
										</td>
										<td className="px-3 py-2">{RIGHTS_LABEL[grant.scope]}</td>
										<td className="px-3 py-2 text-neutral-600">
											{formatDate(grant.granted_at)}
										</td>
										<td className="px-3 py-2 text-neutral-600">
											{grant.expires_at ? formatDate(grant.expires_at) : "—"}
										</td>
										<td className="px-3 py-2">
											{inactive ? (
												<span className="rounded px-2 py-0.5 text-xs bg-neutral-100 text-neutral-600">
													{grant.revoked_at ? "Revoked" : "Expired"}
												</span>
											) : (
												<span className="rounded px-2 py-0.5 text-xs bg-green-100 text-green-700">
													Active
												</span>
											)}
										</td>
										<td className="px-3 py-2">
											{inactive ? (
												<span className="text-xs text-neutral-400">
													License no longer active
												</span>
											) : (
												<div className="flex flex-col gap-3">
													{SCOPE_ALLOWS_PIN[grant.scope] && (
														<GrantPins grant={grant} />
													)}
													{SCOPE_ALLOWS_DOWNLOAD[grant.scope] && (
														<GrantDownload grant={grant} />
													)}
												</div>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{(grants.data?.length ?? 0) > 0 && (
						<div className="border-t border-neutral-100 p-2.5 text-xs text-neutral-500">
							Total: {grants.data?.length}{" "}
							{grants.data?.length === 1 ? "grant" : "grants"}
						</div>
					)}
				</div>
			)}
		</section>
	);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LicensingPage() {
	const offers = useMyOffers();
	const cancel = useCancelOffer();

	return (
		<div className="p-4">
			<div className="mb-4 flex items-center gap-3">
				<h1 className="text-xl font-semibold">UGC Licensing</h1>
				<Link
					href="/licensing/briefs"
					className="text-sm text-blue-600 hover:underline"
				>
					Briefs →
				</Link>
			</div>

			{offers.isLoading ? (
				<p className="text-sm text-neutral-500">Loading…</p>
			) : (offers.data?.length ?? 0) === 0 ? (
				<p className="text-sm text-neutral-500">
					No license offers yet. Offer to license a reel from Creator Content.
				</p>
			) : (
				<div className="overflow-x-auto rounded-lg border border-neutral-200">
					<table className="w-full text-sm">
						<thead className="bg-neutral-50 text-left text-neutral-600">
							<tr>
								<th className="px-3 py-2 font-medium">Reel</th>
								<th className="px-3 py-2 font-medium">Amount</th>
								<th className="px-3 py-2 font-medium">Rights</th>
								<th className="px-3 py-2 font-medium">Funding</th>
								<th className="px-3 py-2 font-medium">Status</th>
								<th className="px-3 py-2 font-medium">Created</th>
								<th className="px-3 py-2 font-medium" />
							</tr>
						</thead>
						<tbody>
							{offers.data?.map((offer) => (
								<tr key={offer.id} className="border-t border-neutral-100">
									<td className="px-3 py-2 font-mono text-xs text-neutral-500">
										{offer.reel_id.slice(0, 8)}…
									</td>
									<td className="px-3 py-2">
										{formatAED(Number(offer.amount_fils))}
									</td>
									<td className="px-3 py-2">
										{RIGHTS_LABEL[offer.rights_scope]}
									</td>
									<td className="px-3 py-2">
										{FUNDING_LABEL[offer.funding_source]}
									</td>
									<td className="px-3 py-2">
										<span
											className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[offer.status]}`}
										>
											{STATUS_LABEL[offer.status]}
										</span>
									</td>
									<td className="px-3 py-2 text-neutral-600">
										{formatDate(offer.created_at)}
									</td>
									<td className="px-3 py-2 text-right">
										{offer.status === "countered" && (
											<CounteredActions offer={offer} />
										)}
										{offer.status === "pending_creator" && (
											<button
												type="button"
												disabled={cancel.isPending}
												onClick={() => cancel.mutate(offer.id)}
												className="rounded bg-neutral-100 px-2 py-1 text-xs disabled:opacity-50"
											>
												Cancel
											</button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{(offers.data?.length ?? 0) > 0 && (
						<div className="border-t border-neutral-100 p-2.5 text-xs text-neutral-500">
							Total: {offers.data?.length}{" "}
							{offers.data?.length === 1 ? "offer" : "offers"}
						</div>
					)}
				</div>
			)}

			<GrantsSection />
		</div>
	);
}
