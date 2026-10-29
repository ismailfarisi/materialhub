"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCreateTicket } from "@/lib/queries/support";
import { Eyebrow, SerifTitle } from "@/components/checkout/maison-primitives";

const CATEGORIES = ["order", "payment", "product", "account"] as const;

export default function NewTicketPage() {
  const t = useTranslations("support");
  const router = useRouter();
  const locale = useLocale();
  const create = useCreateTicket();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ticket = await create.mutateAsync({
        subject,
        category: category || null,
        message,
      });
      router.push(`/${locale}/account/support/${ticket.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? t("errors.submitFailed"));
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <Eyebrow>SUPPORT</Eyebrow>
        <SerifTitle size={24}>{t("list.new")}</SerifTitle>
      </div>
      <input className="rounded border px-3 py-2" placeholder={t("form.subject")}
        value={subject} onChange={(e) => setSubject(e.target.value)} required />
      <select className="rounded border px-3 py-2" value={category}
        onChange={(e) => setCategory(e.target.value as any)}>
        <option value="">{t("form.category")}</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <textarea className="rounded border px-3 py-2" rows={5} placeholder={t("form.message")}
        value={message} onChange={(e) => setMessage(e.target.value)} required />
      {error && <p style={{ color: "hsl(var(--nl-russet))" }}>{error}</p>}
      <button type="submit" disabled={create.isPending} className="rounded px-4 py-2"
        style={{ background: "hsl(var(--nl-espresso))", color: "hsl(var(--nl-linen))" }}>
        {create.isPending ? t("form.submitting") : t("form.submit")}
      </button>
    </form>
  );
}
