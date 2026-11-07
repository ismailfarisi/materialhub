"use client";

import { Field, FormMessage, Panel, PanelHead, Select, StatusBadge, Textarea, type Tone } from "@/components/account/account-ui";
import { apiErrorMessage } from "@/components/account/types";
import { Button } from "@/components/swatch";
import { DISPUTE_CATEGORIES, type DisputeCategory, useOpenDispute, useOrderDisputes } from "@/lib/queries/disputes";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

/** Order statuses where a dispute can be opened (backend DisputeService.openDispute). */
const CAN_OPEN = new Set(["delivered", "shipped"]);
/** Statuses where disputes may exist and the panel is worth a request. */
const HAS_HISTORY = new Set([
	"delivered",
	"shipped",
	"disputed",
	"refund_requested",
	"refunded",
	"partially_refunded",
	"returned",
	"completed",
]);

export function disputeTone(status: string): Tone {
	switch (status) {
		case "resolved_buyer":
		case "resolved_seller":
			return "success";
		case "escalated":
			return "warning";
		case "closed":
			return "neutral";
		default:
			return "progress";
	}
}

interface VendorOrderOption {
	id: string;
	vendor_order_number?: string;
	status?: string;
	vendor?: { name?: string | null } | null;
}

/**
 * Disputes on one order, in the order detail sidebar: the buyer's existing
 * cases (each links to its thread) and, while the order is shipped or
 * delivered and nothing is open, a short form to open one.
 */
export function OrderDisputes({
	orderId,
	orderStatus,
	vendorOrders,
}: {
	orderId: string;
	orderStatus?: string | null;
	vendorOrders: VendorOrderOption[];
}) {
	const t = useTranslations("disputes");
	const locale = useLocale();
	const status = orderStatus ?? "";
	const relevant = HAS_HISTORY.has(status);
	const { data: disputes = [], isLoading, isError } = useOrderDisputes(orderId, relevant);
	const openDispute = useOpenDispute(orderId);

	const [formOpen, setFormOpen] = useState(false);
	const onlyNotReceived = status === "shipped";
	const [category, setCategory] = useState<DisputeCategory>(onlyNotReceived ? "item_not_received" : "not_as_described");
	const [vendorOrderId, setVendorOrderId] = useState(vendorOrders[0]?.id ?? "");
	const [description, setDescription] = useState("");
	const [descError, setDescError] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [justOpened, setJustOpened] = useState(false);

	if (!relevant) return null;

	const hasOpenCase = disputes.some((d) => d.status !== "closed" && !d.status.startsWith("resolved"));
	const canOpen = CAN_OPEN.has(status) && !hasOpenCase;
	const categories = onlyNotReceived ? (["item_not_received"] as const) : DISPUTE_CATEGORIES;
	const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium" });

	function submit() {
		const text = description.trim();
		if (!text) {
			setDescError(true);
			return;
		}
		setDescError(false);
		setSubmitError(null);
		openDispute.mutate(
			{
				category,
				description: text,
				...(vendorOrders.length > 1 && vendorOrderId ? { vendor_order_id: vendorOrderId } : {}),
			},
			{
				onSuccess: () => {
					setFormOpen(false);
					setDescription("");
					setJustOpened(true);
				},
				onError: (err) => setSubmitError(apiErrorMessage(err, t("openFailed"))),
			},
		);
	}

	return (
		<Panel>
			<PanelHead title={t("title")} />
			<div className="grid gap-3 px-4 py-4 md:px-5">
				{isLoading ? (
					<p className="m-0 text-sm text-nl-russet" aria-busy="true">
						…
					</p>
				) : isError ? (
					<p className="m-0 text-sm text-nl-russet">{t("loadFailed")}</p>
				) : disputes.length > 0 ? (
					<ul className="m-0 grid list-none gap-2 p-0">
						{disputes.map((d) => (
							<li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
								<span className="grid gap-0.5">
									<span className="font-mono text-[13px] tabular-nums text-nl-cacao">{d.dispute_number}</span>
									<span className="text-[12.5px] text-nl-russet">{dateFmt.format(new Date(d.created_at))}</span>
								</span>
								<span className="flex items-center gap-2">
									<StatusBadge tone={disputeTone(d.status)}>{t(`status.${d.status}` as "status.opened")}</StatusBadge>
									<Link
										href={`/${locale}/account/orders/${orderId}/disputes/${d.id}`}
										className="text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-amber"
									>
										{t("view")}
									</Link>
								</span>
							</li>
						))}
					</ul>
				) : (
					!formOpen && <p className="m-0 text-[13px] leading-relaxed text-nl-russet">{t("intro")}</p>
				)}

				{justOpened && <FormMessage tone="success">{t("opened")}</FormMessage>}

				{canOpen && !formOpen && (
					<Button variant="outline" size="sm" className="justify-self-start" onClick={() => setFormOpen(true)}>
						{t("open")}
					</Button>
				)}

				{canOpen && formOpen && (
					<form
						className="grid gap-3"
						aria-label={t("openTitle")}
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
					>
						<Field label={t("category")}>
							{(p) => (
								<Select {...p} value={category} onChange={(e) => setCategory(e.target.value as DisputeCategory)}>
									{categories.map((c) => (
										<option key={c} value={c}>
											{t(`categories.${c}`)}
										</option>
									))}
								</Select>
							)}
						</Field>
						{vendorOrders.length > 1 && (
							<Field label={t("supplier")}>
								{(p) => (
									<Select {...p} value={vendorOrderId} onChange={(e) => setVendorOrderId(e.target.value)}>
										{vendorOrders.map((vo) => (
											<option key={vo.id} value={vo.id}>
												{vo.vendor?.name ?? vo.vendor_order_number ?? vo.id.slice(0, 8)}
											</option>
										))}
									</Select>
								)}
							</Field>
						)}
						<Field label={t("description")} hint={t("descriptionHint")} error={descError ? t("descriptionRequired") : undefined}>
							{(p) => (
								<Textarea {...p} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
							)}
						</Field>
						{submitError && <FormMessage tone="error">{submitError}</FormMessage>}
						<div className="flex flex-wrap gap-2">
							<Button type="submit" size="sm" disabled={openDispute.isPending}>
								{openDispute.isPending ? t("submitting") : t("submit")}
							</Button>
							<Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
								{t("cancel")}
							</Button>
						</div>
					</form>
				)}
			</div>
		</Panel>
	);
}
