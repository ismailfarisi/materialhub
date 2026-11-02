"use client";

import { useTranslations, useLocale } from "next-intl";
import { useWallet, useWalletTransactions } from "@/lib/queries/account";
import { formatPrice, formatDate } from "@/lib/utils";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
} from "@/components/checkout/maison-primitives";

const BOX = {
  border: "1px solid rgba(15,18,24,0.10)",
  background: "rgba(15,18,24,0.02)",
} as const;

export default function WalletPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const tType = useTranslations("account.walletTxType");
  const locale = useLocale();
  const { data: wallet, isLoading: walletLoading } = useWallet();
  const { data: transactions, isLoading: txLoading } = useWalletTransactions();

  if (walletLoading)
    return (
      <div>
        <div className="mb-5">
          <Eyebrow>WALLET</Eyebrow>
          <SerifTitle size={26} className="mt-1.5">
            {t("wallet")}
          </SerifTitle>
        </div>
        <div className="p-5 md:p-6 mb-5 md:mb-6 text-center" style={BOX}>
          <div
            className="h-3.5 w-24 mx-auto animate-pulse"
            style={{ background: "rgba(15,18,24,0.07)" }}
          />
          <div
            className="h-8 w-40 mx-auto mt-2 animate-pulse"
            style={{ background: "rgba(15,18,24,0.07)" }}
          />
        </div>
        <div
          className="h-5 w-32 mb-3 animate-pulse"
          style={{ background: "rgba(15,18,24,0.07)" }}
        />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="p-3 flex items-center justify-between gap-3"
              style={BOX}
            >
              <div className="space-y-2">
                <div
                  className="h-3.5 w-24 animate-pulse"
                  style={{ background: "rgba(15,18,24,0.07)" }}
                />
                <div
                  className="h-3 w-32 animate-pulse"
                  style={{ background: "rgba(15,18,24,0.07)" }}
                />
              </div>
              <div
                className="h-3.5 w-16 animate-pulse"
                style={{ background: "rgba(15,18,24,0.07)" }}
              />
            </div>
          ))}
        </div>
      </div>
    );

  const translateType = (type: string) => {
    try {
      return tType(type?.toLowerCase() as any);
    } catch {
      return type?.replace(/_/g, " ") || "";
    }
  };

  const txList = transactions || [];

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>WALLET</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("wallet")}
        </SerifTitle>
      </div>

      <div className="p-5 md:p-6 mb-5 md:mb-6 text-center" style={BOX}>
        <Eyebrow amber={false}>{t("walletBalance")}</Eyebrow>
        <p
          className="mt-2 break-words"
          style={{
            fontFamily: MAISON_SERIF,
            fontSize: 34,
            lineHeight: 1.1,
            color: "hsl(var(--nl-cacao))",
          }}
        >
          {formatPrice(wallet?.balance || 0, "AED", locale)}
        </p>
      </div>

      <div className="mb-3">
        <Eyebrow amber={false}>{t("transactions")}</Eyebrow>
      </div>
      {txLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-3 flex items-center justify-between gap-3"
              style={BOX}
            >
              <div className="space-y-2">
                <div
                  className="h-3.5 w-24 animate-pulse"
                  style={{ background: "rgba(15,18,24,0.07)" }}
                />
                <div
                  className="h-3 w-32 animate-pulse"
                  style={{ background: "rgba(15,18,24,0.07)" }}
                />
              </div>
              <div
                className="h-3.5 w-16 animate-pulse"
                style={{ background: "rgba(15,18,24,0.07)" }}
              />
            </div>
          ))}
        </div>
      ) : txList.length === 0 ? (
        <div
          className="py-12 text-center"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {tCommon("noResults")}
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-2">
            {txList.map((tx: any) => (
              <div key={tx.id} className="p-3" style={BOX}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    style={{
                      fontFamily: MAISON_SERIF,
                      fontSize: 14,
                      color: "hsl(var(--nl-cacao))",
                    }}
                  >
                    {translateType(tx.type)}
                  </span>
                  <span
                    className="whitespace-nowrap"
                    style={{
                      fontFamily: MAISON_SERIF,
                      fontSize: 14,
                      color:
                        tx.amount > 0
                          ? "hsl(140 30% 32%)"
                          : "hsl(var(--nl-russet))",
                    }}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {formatPrice(Math.abs(tx.amount), "AED", locale)}
                  </span>
                </div>
                {tx.description && (
                  <p
                    className="text-xs mt-1 break-words"
                    style={{ color: "hsl(var(--nl-russet))" }}
                  >
                    {tx.description}
                  </p>
                )}
                <p
                  className="text-xs mt-1"
                  style={{ color: "hsl(var(--nl-russet))" }}
                >
                  {formatDate(tx.created_at, locale)}
                </p>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "hsl(var(--nl-russet))",
                    borderBottom: "1px solid rgba(15,18,24,0.10)",
                  }}
                >
                  <th className="text-start py-2 font-normal">
                    {tCommon("date")}
                  </th>
                  <th className="text-start py-2 font-normal">
                    {tCommon("type")}
                  </th>
                  <th className="text-start py-2 font-normal">
                    {tCommon("description")}
                  </th>
                  <th className="text-end py-2 font-normal">
                    {tCommon("amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {txList.map((tx: any) => (
                  <tr
                    key={tx.id}
                    style={{ borderBottom: "1px solid rgba(15,18,24,0.08)" }}
                  >
                    <td
                      className="py-2 whitespace-nowrap"
                      style={{ color: "hsl(var(--nl-cacao))" }}
                    >
                      {formatDate(tx.created_at, locale)}
                    </td>
                    <td
                      className="py-2"
                      style={{ color: "hsl(var(--nl-cacao))" }}
                    >
                      {translateType(tx.type)}
                    </td>
                    <td
                      className="py-2"
                      style={{ color: "hsl(var(--nl-russet))" }}
                    >
                      {tx.description}
                    </td>
                    <td
                      className="py-2 text-end whitespace-nowrap"
                      style={{
                        fontFamily: MAISON_SERIF,
                        fontSize: 14,
                        color:
                          tx.amount > 0
                            ? "hsl(140 30% 32%)"
                            : "hsl(var(--nl-russet))",
                      }}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {formatPrice(Math.abs(tx.amount), "AED", locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
