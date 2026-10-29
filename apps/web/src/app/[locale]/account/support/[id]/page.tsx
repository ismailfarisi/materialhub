"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTicket, useSendMessage, useTicketStream } from "@/lib/queries/support";
import { MessageThread } from "@/components/support/message-thread";
import { TicketTimeline } from "@/components/support/ticket-timeline";
import { Eyebrow, SerifTitle } from "@/components/checkout/maison-primitives";

export default function SupportDetailPage() {
  const t = useTranslations("support");
  const { id } = useParams<{ id: string }>();
  const { data: ticket, isLoading } = useTicket(id);
  const send = useSendMessage(id);
  const [text, setText] = useState("");
  useTicketStream(id, true);

  if (isLoading || !ticket) return <p>…</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const value = text;
    setText("");
    try {
      await send.mutateAsync(value);
    } catch {
      setText(value);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Eyebrow>{t("detail.ticketNumber")} {ticket.ticket_number}</Eyebrow>
        <SerifTitle size={24}>{ticket.subject}</SerifTitle>
      </div>
      <TicketTimeline currentStatus={ticket.status} />
      <div className="rounded border p-4">
        <MessageThread messages={ticket.messages ?? []} />
      </div>
      {ticket.status !== "closed" && (
        <form onSubmit={submit} className="flex items-center gap-2">
          <input className="flex-1 rounded border px-3 py-2" value={text}
            onChange={(e) => setText(e.target.value)} placeholder={t("chat.replyPlaceholder")} />
          <button type="submit" disabled={send.isPending} className="rounded px-4 py-2"
            style={{ background: "hsl(var(--nl-amber))", color: "hsl(var(--nl-espresso))" }}>
            {t("chat.send")}
          </button>
        </form>
      )}
    </div>
  );
}
