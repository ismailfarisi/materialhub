"use client";

import { useTranslations } from "next-intl";
import { MAISON_SANS } from "@/components/checkout/maison-primitives";

const STATUSES = ["requested", "approved", "shipped_back", "received", "refunded"] as const;

type Status = (typeof STATUSES)[number] | "rejected";

export function ReturnTimeline({ currentStatus }: { currentStatus: string }) {
  const t = useTranslations("returns.statuses");
  const status = (currentStatus?.toLowerCase() ?? "") as Status;

  if (status === "rejected") {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 uppercase"
        style={{
          border: "1px solid hsla(0,55%,42%,0.3)",
          background: "hsla(0,55%,42%,0.05)",
          color: "hsl(0,55%,42%)",
          fontFamily: MAISON_SANS,
          fontSize: 10,
          letterSpacing: "0.18em",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="shrink-0"
          aria-hidden="true"
        >
          <title>Rejected</title>
          <path d="M2 2 L10 10 M10 2 L2 10" />
        </svg>
        <span>{t("rejected")}</span>
      </div>
    );
  }

  const currentIndex = STATUSES.indexOf(status as (typeof STATUSES)[number]);

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto max-w-full">
      {STATUSES.map((s, i) => {
        const done = i <= currentIndex;
        return (
          <div key={s} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="flex items-center justify-center h-6 w-6"
                style={{
                  border: `1px solid ${done ? "hsl(var(--nl-amber))" : "rgba(15,18,24,0.3)"}`,
                  background: done ? "hsl(var(--nl-amber))" : "transparent",
                  color: done ? "hsl(var(--nl-espresso))" : "hsl(var(--nl-russet))",
                }}
              >
                {i < currentIndex ? (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <title>Completed</title>
                    <path d="M2 6.5 L5 9 L10 3" />
                  </svg>
                ) : (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "currentColor",
                    }}
                  />
                )}
              </div>
              <span
                className="leading-none whitespace-nowrap uppercase"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  color: done ? "hsl(var(--nl-cacao))" : "hsl(var(--nl-russet))",
                }}
              >
                {t(s)}
              </span>
            </div>
            {i < STATUSES.length - 1 && (
              <div
                className="w-4 sm:w-6 mx-0.5 sm:mx-1 mb-4"
                style={{
                  height: 1,
                  background:
                    i < currentIndex ? "hsl(var(--nl-amber))" : "rgba(15,18,24,0.18)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
