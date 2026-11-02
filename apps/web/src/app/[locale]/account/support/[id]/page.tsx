"use client";

import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, PanelHead, StatusBadge, Textarea } from "@/components/account/account-ui";
import { statusLabel, ticketTone } from "@/components/account/status";
import { Button } from "@/components/swatch";
import { MessageThread } from "@/components/support/message-thread";
import { TicketTimeline } from "@/components/support/ticket-timeline";
import { useSendMessage, useTicket, useTicketStream } from "@/lib/queries/support";
import { LifeBuoy, SendHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function SupportDetailPage() {
	const t = useTranslations("support");
	const locale = useLocale();
	const { id } = useParams<{ id: string }>();
	const { data: ticket, isLoading, isError, refetch } = useTicket(id);
	const send = useSendMessage(id);
	const [text, setText] = useState("");
	const [sendError, setSendError] = useState(false);
	useTicketStream(id, true);

	if (isLoading) return <ListSkeleton rows={2} />;
	if (isError) return <ErrorState onRetry={() => refetch()} />;
	if (!ticket) {
		return <EmptyState icon={LifeBuoy} title={t("detail.notFound")} action={{ label: t("list.title"), href: `/${locale}/account/support` }} />;
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!text.trim()) return;
		const value = text;
		setText("");
		setSendError(false);
		try {
			await send.mutateAsync(value);
		} catch {
			setText(value);
			setSendError(true);
		}
	}

	return (
		<div>
			<PageHeader
				title={ticket.subject}
				description={
					<span className="inline-flex flex-wrap items-center gap-2">
						<span className="font-mono tabular-nums">
							{t("detail.ticketNumber")} {ticket.ticket_number}
						</span>
						<StatusBadge tone={ticketTone(ticket.status)}>{statusLabel((k) => t(`statuses.${k}`), ticket.status)}</StatusBadge>
					</span>
				}
			/>
			<div className="grid max-w-[860px] gap-4">
				<Panel className="p-4 md:p-5">
					<TicketTimeline currentStatus={ticket.status} />
				</Panel>
				<Panel>
					<PanelHead title={t("detail.conversation")} />
					<div className="p-4 md:p-5">
						<MessageThread messages={ticket.messages ?? []} />
					</div>
					{ticket.status !== "closed" ? (
						<form onSubmit={submit} className="grid gap-2 border-t border-nl-cacao/10 p-4 md:p-5">
							<label htmlFor="ticket-reply" className="text-[13px] font-medium text-nl-cacao">
								{t("detail.reply")}
							</label>
							<Textarea
								id="ticket-reply"
								rows={3}
								className="min-h-[88px]"
								value={text}
								onChange={(e) => setText(e.target.value)}
								placeholder={t("chat.replyPlaceholder")}
								onKeyDown={(e) => {
									if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
								}}
							/>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className={sendError ? "text-[13px] text-destructive" : "text-[13px] text-nl-russet"} role={sendError ? "alert" : undefined}>
									{sendError ? t("errors.submitFailed") : t("detail.replyHint")}
								</span>
								<Button type="submit" disabled={send.isPending || !text.trim()}>
									<SendHorizontal className="h-4 w-4 rtl:-scale-x-100" strokeWidth={1.75} aria-hidden="true" />
									{t("chat.send")}
								</Button>
							</div>
						</form>
					) : (
						<p className="m-0 border-t border-nl-cacao/10 p-4 text-sm text-nl-russet md:p-5">{t("detail.closedNote")}</p>
					)}
				</Panel>
			</div>
		</div>
	);
}
