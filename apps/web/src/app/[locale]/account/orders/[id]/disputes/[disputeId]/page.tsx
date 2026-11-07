"use client";

import {
	EmptyState,
	ErrorState,
	Field,
	FormMessage,
	ListSkeleton,
	PageHeader,
	Panel,
	PanelHead,
	StatusBadge,
	Textarea,
} from "@/components/account/account-ui";
import { disputeTone } from "@/components/account/order-disputes";
import { apiErrorMessage } from "@/components/account/types";
import { Button } from "@/components/swatch";
import { useBuyerDispute, useDisputeMessages, usePostDisputeMessage } from "@/lib/queries/disputes";
import { cn, formatPrice } from "@/lib/utils";
import { MessagesSquare } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function DisputeThreadPage() {
	const t = useTranslations("disputes");
	const locale = useLocale();
	const { id: orderId, disputeId } = useParams<{ id: string; disputeId: string }>();
	const dispute = useBuyerDispute(disputeId);
	const messages = useDisputeMessages(disputeId);
	const post = usePostDisputeMessage(disputeId);
	const [reply, setReply] = useState("");
	const [sendError, setSendError] = useState<string | null>(null);

	const dateTimeFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium" });
	const backHref = `/${locale}/account/orders/${orderId}`;

	if (dispute.isLoading) return <ListSkeleton rows={3} />;

	const status = (dispute.error as { response?: { status?: number } } | null)?.response?.status;
	if (dispute.isError && status !== 404) return <ErrorState onRetry={() => dispute.refetch()} />;
	const d = dispute.data;
	if (!d || d.order_id !== orderId) {
		return (
			<EmptyState
				icon={MessagesSquare}
				title={t("notFound")}
				body={t("notFoundBody")}
				action={{ label: t("backToOrder"), href: backHref }}
			/>
		);
	}

	const closed = d.status === "closed";

	function send() {
		const text = reply.trim();
		if (!text) return;
		setSendError(null);
		post.mutate(text, {
			onSuccess: () => setReply(""),
			onError: (err) => setSendError(apiErrorMessage(err, t("sendFailed"))),
		});
	}

	return (
		<div>
			<PageHeader
				title={
					<bdi className="font-mono tabular-nums">{t("threadTitle", { number: d.dispute_number })}</bdi>
				}
				description={
					<span className="inline-flex flex-wrap items-center gap-2">
						<StatusBadge tone={disputeTone(d.status)}>{t(`status.${d.status}` as "status.opened")}</StatusBadge>
						<Link href={backHref} className="underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-amber">
							{t("backToOrder")}
						</Link>
					</span>
				}
			/>

			<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
				<Panel>
					<PanelHead title={t("thread")} />
					<div className="grid gap-4 px-4 py-4 md:px-5">
						{messages.isLoading ? (
							<ListSkeleton rows={2} />
						) : (messages.data ?? []).length === 0 ? (
							<p className="m-0 text-sm text-nl-russet">{t("noMessages")}</p>
						) : (
							<ol className="m-0 grid list-none gap-3 p-0">
								{(messages.data ?? []).map((m) => {
									const mine = m.sender_role === "customer";
									return (
										<li key={m.id} className={cn("grid max-w-[85%] gap-1", mine ? "justify-self-end" : "justify-self-start")}>
											<span className={cn("text-[12.5px] text-nl-russet", mine && "text-end")}>
												{t(`sender.${m.sender_role}` as "sender.customer")} ·{" "}
												<time dateTime={m.created_at} className="font-mono tabular-nums">
													{dateTimeFmt.format(new Date(m.created_at))}
												</time>
											</span>
											<p
												className={cn(
													"m-0 whitespace-pre-line break-words rounded-md px-4 py-3 text-[14.5px] leading-relaxed",
													mine ? "bg-nl-cacao text-white" : "bg-nl-linen text-nl-cacao",
												)}
											>
												{m.message}
											</p>
										</li>
									);
								})}
							</ol>
						)}

						{closed ? (
							<p className="m-0 border-t border-nl-cacao/10 pt-3 text-sm text-nl-russet">{t("closedNote")}</p>
						) : (
							<form
								className="grid gap-3 border-t border-nl-cacao/10 pt-4"
								onSubmit={(e) => {
									e.preventDefault();
									send();
								}}
							>
								<Field label={t("reply")}>
									{(p) => (
										<Textarea {...p} value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} />
									)}
								</Field>
								{sendError && <FormMessage tone="error">{sendError}</FormMessage>}
								<Button type="submit" size="sm" className="justify-self-start" disabled={post.isPending || !reply.trim()}>
									{post.isPending ? t("sending") : t("send")}
								</Button>
							</form>
						)}
					</div>
				</Panel>

				<div className="grid gap-4">
					<Panel>
						<PanelHead title={t("yourComplaint")} />
						<div className="grid gap-2 px-4 py-4 md:px-5">
							<p className="m-0 text-[13px] font-medium text-nl-cacao">{t(`categories.${d.category}` as "categories.other")}</p>
							<p className="m-0 whitespace-pre-line break-words text-[14px] leading-relaxed text-nl-russet">{d.description}</p>
							{d.deadline_at && !d.resolved_at && (
								<p className="m-0 text-[13px] text-nl-russet">{t("respondBy", { date: dateFmt.format(new Date(d.deadline_at)) })}</p>
							)}
						</div>
					</Panel>
					{d.resolution && (
						<Panel>
							<PanelHead title={t("decision")} />
							<div className="grid gap-2 px-4 py-4 md:px-5">
								<p className="m-0 whitespace-pre-line text-[14px] leading-relaxed text-nl-cacao">{d.resolution}</p>
								{(d.resolution_amount ?? 0) > 0 && (
									<p className="m-0 font-mono text-[13.5px] tabular-nums text-nl-cacao">
										{t("refunded", { amount: formatPrice(d.resolution_amount ?? 0, "AED", locale) })}
									</p>
								)}
							</div>
						</Panel>
					)}
				</div>
			</div>
		</div>
	);
}
