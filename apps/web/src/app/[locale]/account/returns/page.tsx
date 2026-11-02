"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useReturns } from "@/lib/queries/orders";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

const STATUS_OPTIONS = [
  "",
  "requested",
  "approved",
  "shipped_back",
  "received",
  "refunded",
  "rejected",
] as const;

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatFils(fils: number | null | undefined) {
  if (fils == null) return "—";
  return `AED ${(fils / 100).toFixed(2)}`;
}

export default function ReturnsPage() {
  const t = useTranslations("returns");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useReturns({ page });
  // useReturns already unwraps response.data to the array; tolerate either
  // a bare array or a paginated envelope just in case.
  const items: any[] = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
  const filtered = status ? items.filter((r) => r.status === status) : items;

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>RETURNS</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("title")}
        </SerifTitle>
      </div>

      <div className="mb-5">
        <label
          htmlFor="status-filter"
          className="block mb-1.5 uppercase"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "hsl(var(--nl-russet))",
          }}
        >
          {t("statusFilter")}
        </label>
        <select
          id="status-filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-2.5 py-2 text-sm"
          style={{
            border: "1px solid rgba(15,18,24,0.2)",
            background: "transparent",
            borderRadius: 0,
            color: "hsl(var(--nl-cacao))",
            fontFamily: MAISON_SANS,
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? t(`statuses.${s}`) : t("statuses.all")}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p
          className="py-12 text-center"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {tCommon("loading")}
        </p>
      ) : filtered.length === 0 ? (
        <p
          className="py-12 text-center"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {t("empty")}
        </p>
      ) : (
        <ul style={{ border: "1px solid rgba(15,18,24,0.10)" }}>
          {filtered.map((ret: any, i: number) => (
            <li
              key={ret.id}
              style={
                i > 0
                  ? { borderTop: "1px solid rgba(15,18,24,0.08)" }
                  : undefined
              }
            >
              <Link
                href={`/${locale}/account/returns/${ret.id}`}
                className="flex items-center justify-between gap-3 p-3.5 transition-colors hover:bg-[rgba(15,18,24,0.02)]"
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 13,
                      color: "hsl(var(--nl-cacao))",
                    }}
                  >
                    {ret.return_number ?? ret.id.slice(0, 8)}
                  </div>
                  <div
                    className="mt-0.5 uppercase"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 10,
                      letterSpacing: "0.14em",
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {formatDate(ret.created_at, locale)} ·{" "}
                    {t(`statuses.${ret.status}`)}
                  </div>
                </div>
                <div
                  className="shrink-0"
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontSize: 15,
                    color: "hsl(var(--nl-cacao))",
                  }}
                >
                  {formatFils(ret.refund_amount)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
