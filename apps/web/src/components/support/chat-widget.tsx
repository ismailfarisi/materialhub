"use client";

import { MAISON_SANS } from "@/components/checkout/maison-primitives";
import { MessageThread } from "@/components/support/message-thread";
import { useCreateTicket, useSendMessage, useTicket, useTicketStream } from "@/lib/queries/support";
import { useAuthStore } from "@/stores/auth";
import { useChatStore } from "@/stores/chat";
import { MessageCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export function ChatWidget() {
  const t = useTranslations("support");
  const { isOpen, open, close, activeTicketId, setActiveTicket } = useChatStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: ticket } = useTicket(activeTicketId ?? undefined);
  useTicketStream(activeTicketId ?? undefined, isOpen && !!activeTicketId);

  // Escape to close + scroll-lock while open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={open}
        aria-label={t("chat.open")}
        // Sits above the mobile tab bar (h-14 + safe area), which is lg:hidden —
        // at lg+ the bar is gone and the launcher drops back to the corner.
        // Same offset the filter pill uses, so the two stack consistently.
        className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-5 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg"
        style={{ background: "hsl(var(--nl-espresso))", color: "hsl(var(--nl-linen))" }}
      >
        <MessageCircle size={24} />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label={t("chat.close")}
            onClick={close}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.2)" }}
          />
          {/* biome-ignore lint/a11y/useSemanticElements: native <dialog> brings its own positioning/backdrop semantics that conflict with this slide-over layout */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.title")}
            className="fixed bottom-0 end-0 z-50 flex h-[70vh] w-full max-w-sm flex-col rounded-t-2xl shadow-2xl sm:bottom-5 sm:end-5 sm:h-[520px] sm:rounded-2xl"
            style={{ background: "hsl(var(--nl-linen))", fontFamily: MAISON_SANS }}
          >
            <header className="flex items-center justify-between border-b px-4 py-3">
              <span style={{ fontWeight: 600 }}>{t("chat.title")}</span>
              <button type="button" onClick={close} aria-label={t("chat.close")}>
                <X size={20} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTicketId && ticket ? (
                <MessageThread messages={ticket.messages ?? []} />
              ) : activeTicketId ? (
                <p style={{ fontFamily: MAISON_SANS, fontSize: 14, opacity: 0.6 }}>…</p>
              ) : (
                <StartConversation
                  isGuest={!isAuthenticated}
                  onCreated={(id) => setActiveTicket(id)}
                />
              )}
            </div>

            {activeTicketId && ticket && <Composer ticketId={activeTicketId} />}
          </aside>
        </>
      )}
    </>
  );
}

function StartConversation({
  isGuest,
  onCreated,
}: {
  isGuest: boolean;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("support");
  const create = useCreateTicket();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ticket = await create.mutateAsync({
        subject: subject || message.slice(0, 60),
        category: null,
        message,
        ...(isGuest ? { guest_name: name, guest_email: email } : {}),
      });
      onCreated(ticket.id);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? t("errors.submitFailed"));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p style={{ fontSize: 14 }}>{t("chat.intro")}</p>
      {isGuest && (
        <>
          <input
            className="rounded border px-3 py-2"
            placeholder={t("chat.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="email"
            className="rounded border px-3 py-2"
            placeholder={t("chat.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </>
      )}
      <textarea
        className="rounded border px-3 py-2"
        placeholder={t("chat.messagePlaceholder")}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        rows={3}
      />
      {error && <p style={{ color: "hsl(var(--nl-russet))", fontSize: 13 }}>{error}</p>}
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded px-4 py-2"
        style={{ background: "hsl(var(--nl-espresso))", color: "hsl(var(--nl-linen))" }}
      >
        {create.isPending ? t("chat.sending") : t("chat.start")}
      </button>
    </form>
  );
}

function Composer({ ticketId }: { ticketId: string }) {
  const t = useTranslations("support");
  const send = useSendMessage(ticketId);
  const [text, setText] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const value = text;
    setText("");
    try {
      await send.mutateAsync(value);
    } catch {
      setText(value); // restore on failure
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t p-3">
      <input
        className="flex-1 rounded border px-3 py-2"
        placeholder={t("chat.replyPlaceholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="submit"
        disabled={send.isPending}
        className="rounded px-3 py-2"
        style={{ background: "hsl(var(--nl-amber))", color: "hsl(var(--nl-espresso))" }}
      >
        {t("chat.send")}
      </button>
    </form>
  );
}
