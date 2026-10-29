"use client";
import { useEffect, useState } from "react";
import { Eyebrow, MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import {
  BOX,
  BUTTON_CLASS,
  PRIMARY_BUTTON,
  StatusLine,
} from "@/components/creator/maison-ui";
import { getCreatorSummary, requestPayout } from "@/lib/api/creator";

const THRESHOLD_FILS = 20000;

export function PayoutRequestCard() {
  const [earned, setEarned] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  async function load() {
    try {
      const s = await getCreatorSummary();
      setEarned(s.earned?.totalFils ?? 0);
    } catch {
      /* silent */
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function go() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await requestPayout();
      setMessage({
        kind: "ok",
        text: `Payout queued: AED ${(r.amountFils / 100).toFixed(2)}`,
      });
      await load();
    } catch (err: unknown) {
      const anyErr = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      const apiErr =
        anyErr?.response?.data?.error ?? anyErr?.message ?? "Payout failed";
      setMessage({ kind: "err", text: String(apiErr) });
    } finally {
      setBusy(false);
    }
  }

  const eligible = earned >= THRESHOLD_FILS;
  const pct = Math.min(100, Math.round((earned / THRESHOLD_FILS) * 100));

  return (
    <div className="p-4" style={BOX}>
      <Eyebrow>Cash payout</Eyebrow>
      <div
        className="mt-1.5"
        style={{
          fontFamily: MAISON_SANS,
          fontSize: 12,
          color: "hsl(var(--nl-russet))",
        }}
      >
        Threshold: AED 200
      </div>
      <div
        className="w-full mt-2.5 overflow-hidden"
        style={{ height: 3, background: "rgba(44,24,16,0.10)" }}
      >
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: "hsl(var(--nl-amber))" }}
        />
      </div>
      <div
        className="mt-2"
        style={{
          fontFamily: MAISON_SERIF,
          fontSize: 16,
          color: "hsl(var(--nl-cacao))",
        }}
      >
        AED {(earned / 100).toFixed(2)}{" "}
        <span style={{ color: "hsl(var(--nl-russet))" }}>/ AED 200</span>
      </div>
      <button
        type="button"
        onClick={go}
        disabled={!eligible || busy}
        className={`mt-4 ${BUTTON_CLASS}`}
        style={PRIMARY_BUTTON}
      >
        {busy ? "Processing…" : "Request payout"}
      </button>
      {message && (
        <div className="mt-2">
          <StatusLine kind={message.kind}>{message.text}</StatusLine>
        </div>
      )}
    </div>
  );
}
