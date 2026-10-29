"use client";
import { useEffect, useState } from "react";
import { MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import { BOX, ErrorNote, Quiet } from "@/components/creator/maison-ui";
import { getCreatorSummary, type CreatorSummary } from "@/lib/api/creator";

function formatAed(fils: number): string {
  return `AED ${(fils / 100).toFixed(2)}`;
}

const STATUS_CARDS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "earned", label: "Available" },
  { key: "voided", label: "Voided" },
  { key: "paid_out", label: "Paid out" },
];

export function CreatorSummaryCard() {
  const [summary, setSummary] = useState<CreatorSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCreatorSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load summary",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!summary) return <Quiet>Loading…</Quiet>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {STATUS_CARDS.map(({ key, label }) => {
        const row = summary[key] ?? { count: 0, totalFils: 0 };
        return (
          <div key={key} className="p-3.5" style={BOX}>
            <div
              className="uppercase"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 10,
                letterSpacing: "0.2em",
                color: "hsl(var(--nl-russet))",
              }}
            >
              {label}
            </div>
            <div
              className="mt-1.5 break-words"
              style={{
                fontFamily: MAISON_SERIF,
                fontSize: 22,
                lineHeight: 1.15,
                color: "hsl(var(--nl-cacao))",
              }}
            >
              {formatAed(row.totalFils)}
            </div>
            <div
              className="mt-1"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 11,
                color: "hsl(var(--nl-russet))",
              }}
            >
              {row.count} commission{row.count === 1 ? "" : "s"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
