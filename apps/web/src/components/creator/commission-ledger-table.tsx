"use client";
import { useEffect, useState } from "react";
import { MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import {
  ErrorNote,
  Pill,
  Quiet,
  SECONDARY_BUTTON,
  SECONDARY_BUTTON_CLASS,
} from "@/components/creator/maison-ui";
import {
  getCreatorCommissions,
  type CommissionListItem,
} from "@/lib/api/creator";

const HEAD_STYLE = {
  fontFamily: MAISON_SANS,
  fontSize: 10,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "hsl(var(--nl-russet))",
} as const;

const CELL_STYLE = {
  fontFamily: MAISON_SANS,
  fontSize: 12.5,
  color: "hsl(var(--nl-cacao))",
} as const;

const ROW_BORDER = "1px solid rgba(44,24,16,0.10)";

/** Settled money is worth reading as final; anything still in flight is not. */
function toneFor(status: string) {
  if (status === "paid_out" || status === "earned") return "success" as const;
  if (status === "voided") return "danger" as const;
  return "amber" as const;
}

export function CommissionLedgerTable({ status }: { status?: string }) {
  const [items, setItems] = useState<CommissionListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore(
    reset: boolean,
    currentCursor: string | null,
  ): Promise<void> {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getCreatorCommissions(
        status,
        currentCursor ?? undefined,
      );
      setItems((prev) => (reset ? result.items : [...prev, ...result.items]));
      setCursor(result.nextCursor);
      setHasMore(Boolean(result.nextCursor));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load commissions",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    loadMore(true, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: ROW_BORDER }}>
              <th className="text-start py-2.5" style={HEAD_STYLE}>
                Date
              </th>
              <th className="text-start py-2.5" style={HEAD_STYLE}>
                Reel
              </th>
              <th className="text-start py-2.5" style={HEAD_STYLE}>
                Order
              </th>
              <th className="text-start py-2.5" style={HEAD_STYLE}>
                Status
              </th>
              <th className="text-end py-2.5" style={HEAD_STYLE}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} style={{ borderBottom: ROW_BORDER }}>
                <td className="py-3 whitespace-nowrap" style={CELL_STYLE}>
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                <td className="py-3" style={CELL_STYLE}>
                  <a
                    href={`/reels/${c.reel_id}`}
                    className="uppercase transition-colors hover:opacity-70"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      color: "hsl(var(--nl-amber-text))",
                    }}
                  >
                    View
                  </a>
                </td>
                <td
                  className="py-3 font-mono"
                  style={{ ...CELL_STYLE, fontSize: 11, color: "hsl(var(--nl-russet))" }}
                >
                  {c.order_id.slice(0, 8)}…
                </td>
                <td className="py-3">
                  <Pill tone={toneFor(c.status)}>{c.status.replace(/_/g, " ")}</Pill>
                </td>
                <td
                  className="py-3 text-end whitespace-nowrap"
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontSize: 15,
                    color: "hsl(var(--nl-cacao))",
                  }}
                >
                  AED {(Number(c.gross_commission_fils) / 100).toFixed(2)}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-10 text-center">
                  <Quiet>No commissions yet.</Quiet>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasMore && items.length > 0 && (
        <button
          type="button"
          onClick={() => loadMore(false, cursor)}
          disabled={loading}
          className={`mt-4 ${SECONDARY_BUTTON_CLASS}`}
          style={SECONDARY_BUTTON}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
