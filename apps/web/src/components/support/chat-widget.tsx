"use client";

import { Field, FieldError, Input, Textarea, inputClass } from "@/components/account/account-ui";
import { apiErrorMessage } from "@/components/account/types";
import { Button } from "@/components/swatch";
import { MessageThread } from "@/components/support/message-thread";
import { useCreateTicket, useSendMessage, useTicket, useTicketStream } from "@/lib/queries/support";
import { useAuthStore } from "@/stores/auth";
import { useChatStore } from "@/stores/chat";
import { cn } from "@/lib/utils";
import { MessageCircle, SendHorizontal, X } from "lucide-react";
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
        className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-5 end-4 md:end-5 z-40 flex h-12 w-12 items-center justify-center rounded-md bg-nl-cacao text-white shadow-lift transition-[background-color,transform] hover:bg-nl-cacao/90 active:translate-y-px"
      >
        <MessageCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label={t("chat.close")}
            onClick={close}
            className="fixed inset-0 z-40 bg-nl-espresso/30"
          />
          {/* biome-ignore lint/a11y/useSemanticElements: native <dialog> brings its own positioning/backdrop semantics that conflict with this slide-over layout */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.title")}
            className="fixed bottom-0 end-0 z-50 flex h-[min(78dvh,620px)] w-full flex-col overflow-hidden rounded-t-md bg-nl-pearl shadow-lift sm:bottom-5 sm:end-5 sm:h-[560px] sm:max-w-[380px] sm:rounded-md"
          >
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-nl-cacao/10 ps-4 pe-2">
              <span className="font-display text-[15.5px] font-semibold text-nl-cacao">{t("chat.title")}</span>
              <Button variant="ghost" size="icon" onClick={close} aria-label={t("chat.close")}>
                <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </header>

            <div className="scrollbar-nl flex-1 overflow-y-auto p-4">
              {activeTicketId && ticket ? (
                <MessageThread messages={ticket.messages ?? []} />
              ) : activeTicketId ? (
                <output className="grid gap-3" aria-label={t("chat.loading")}>
                  <div className="h-10 w-2/3 animate-pulse rounded-md bg-nl-cacao/[0.07] motion-reduce:animate-none" />
                  <div className="h-10 w-1/2 animate-pulse justify-self-end rounded-md bg-nl-cacao/[0.07] motion-reduce:animate-none" />
                </output>
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
    } catch (err) {
      setError(apiErrorMessage(err, t("errors.submitFailed")));
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <p className="m-0 text-sm text-nl-russet">{t("chat.intro")}</p>
      {isGuest && (
        <>
          <Field label={t("chat.nameLabel")}>
            {(p) => <Input {...p} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />}
          </Field>
          <Field label={t("chat.emailLabel")}>
            {(p) => (
              <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            )}
          </Field>
        </>
      )}
      <Field label={t("chat.messageLabel")}>
        {(p) => <Textarea {...p} value={message} onChange={(e) => setMessage(e.target.value)} required rows={4} />}
      </Field>
      {error && <FieldError>{error}</FieldError>}
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? t("chat.sending") : t("chat.start")}
      </Button>
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
    <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-nl-cacao/10 p-3">
      <label htmlFor="chat-reply" className="sr-only">
        {t("chat.replyPlaceholder")}
      </label>
      <input
        id="chat-reply"
        className={cn(inputClass, "h-11 flex-1")}
        placeholder={t("chat.replyPlaceholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={send.isPending || !text.trim()} aria-label={t("chat.send")}>
        <SendHorizontal className="h-4 w-4 rtl:-scale-x-100" strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </form>
  );
}
