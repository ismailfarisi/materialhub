"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMyTickets } from "@/lib/queries/support";
import { Eyebrow, SerifTitle } from "@/components/checkout/maison-primitives";

export default function SupportListPage() {
  const t = useTranslations("support");
  const locale = useLocale();
  const [page] = useState(1);
  const { data, isLoading } = useMyTickets({ page });
  const tickets = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Eyebrow>SUPPORT</Eyebrow>
          <SerifTitle size={26}>{t("list.title")}</SerifTitle>
        </div>
        <Link href={`/${locale}/account/support/new`} className="rounded px-4 py-2"
          style={{ background: "hsl(var(--nl-espresso))", color: "hsl(var(--nl-linen))" }}>
          {t("list.new")}
        </Link>
      </div>

      {isLoading ? (
        <p className="mt-6">…</p>
      ) : tickets.length === 0 ? (
        <p className="mt-6">{t("list.empty")}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link href={`/${locale}/account/support/${ticket.id}`}
                className="flex items-center justify-between rounded border p-4">
                <span>{ticket.subject}</span>
                <span style={{ fontSize: 13, opacity: 0.7 }}>{t(`statuses.${ticket.status}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
