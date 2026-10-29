"use client";
import { useEffect, useState } from "react";
import { MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import {
  BOX,
  BUTTON_CLASS,
  ErrorNote,
  FieldLabel,
  INPUT_CLASS,
  INPUT_STYLE,
  Pill,
  Quiet,
  SECONDARY_BUTTON_CLASS,
  SMALL_PRIMARY,
  SMALL_SECONDARY,
  StatusLine,
  type Tone,
} from "@/components/creator/maison-ui";
import {
  acceptLicenseOffer,
  counterLicenseOffer,
  declineLicenseOffer,
  getLicenseOfferEvents,
  getCreatorLicenseOffers,
  type LicenseOfferEvent,
  type LicenseOfferItem,
} from "@/lib/api/creator";

const SCOPE_LABEL: Record<LicenseOfferItem["rights_scope"], string> = {
  in_platform: "In-platform",
  off_platform: "Off-platform",
  both: "In + off-platform",
};

const FUNDING_LABEL: Record<LicenseOfferItem["funding_source"], string> = {
  stripe: "Card",
  payout_balance: "Payout balance",
};

const STATUS_TONE: Record<LicenseOfferItem["status"], Tone> = {
  pending_creator: "amber",
  countered: "amber",
  completed: "success",
  declined: "danger",
  expired: "muted",
  cancelled: "muted",
};

const META_LABEL = {
  fontFamily: MAISON_SANS,
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "hsl(var(--nl-russet))",
} as const;

const META_VALUE = {
  fontFamily: MAISON_SANS,
  fontSize: 12,
  color: "hsl(var(--nl-cacao))",
} as const;

function aed(fils: string): string {
  return `AED ${(Number(fils) / 100).toFixed(2)}`;
}

/** Net the creator keeps after the 20% platform fee. */
function aedNet(fils: string): string {
  return `AED ${((Number(fils) * 0.8) / 100).toFixed(2)}`;
}

// ── History expander ──────────────────────────────────────────────────────────

function OfferHistory({ offerId }: { offerId: string }) {
  const [events, setEvents] = useState<LicenseOfferEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLicenseOfferEvents(offerId)
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [offerId]);

  if (loading)
    return (
      <div className="mt-2">
        <Quiet>Loading history…</Quiet>
      </div>
    );
  if (events.length === 0)
    return (
      <div className="mt-2">
        <Quiet>No events yet.</Quiet>
      </div>
    );

  return (
    <div className="mt-2 space-y-1">
      {events.map((ev) => (
        <div
          key={ev.id}
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 11.5,
            color: "hsl(var(--nl-russet))",
          }}
        >
          <span className="capitalize" style={{ color: "hsl(var(--nl-cacao))" }}>
            {ev.actor}
          </span>{" "}
          {ev.event_type}
          {ev.amount_fils ? ` — ${aed(ev.amount_fils)}` : ""}
          {ev.note ? ` "${ev.note}"` : ""}
          <span className="ms-1 opacity-60">
            {new Date(ev.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export function LicensingTab() {
  const [offers, setOffers] = useState<LicenseOfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  // per-offer counter UI state
  const [counterAed, setCounterAed] = useState<Record<string, string>>({});
  const [counterNote, setCounterNote] = useState<Record<string, string>>({});
  const [showCounter, setShowCounter] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getCreatorLicenseOffers();
      setOffers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load offers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(
    offerId: string,
    action: "accept" | "decline",
  ): Promise<void> {
    setBusyId(offerId);
    setMessage(null);
    try {
      if (action === "accept") {
        await acceptLicenseOffer(offerId);
        setMessage({ kind: "ok", text: "Offer accepted — credit on its way." });
      } else {
        await declineLicenseOffer(offerId);
        setMessage({ kind: "ok", text: "Offer declined." });
      }
      await load();
    } catch (err: unknown) {
      const anyErr = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      const apiErr =
        anyErr?.response?.data?.error ?? anyErr?.message ?? "Action failed";
      setMessage({ kind: "err", text: String(apiErr) });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCounter(offerId: string): Promise<void> {
    const aedVal = Number.parseFloat(counterAed[offerId] ?? "");
    if (Number.isNaN(aedVal) || aedVal < 50) {
      setMessage({ kind: "err", text: "Counter amount must be at least AED 50." });
      return;
    }
    const fils = Math.round(aedVal * 100);
    const note = counterNote[offerId] || undefined;

    setBusyId(offerId);
    setMessage(null);
    try {
      await counterLicenseOffer(offerId, fils, note);
      setMessage({ kind: "ok", text: "Counter offer sent." });
      setShowCounter((prev) => ({ ...prev, [offerId]: false }));
      await load();
    } catch (err: unknown) {
      const anyErr = err as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      const apiErr =
        anyErr?.response?.data?.error ?? anyErr?.message ?? "Action failed";
      setMessage({ kind: "err", text: String(apiErr) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {message && (
        <div className="mb-4">
          <StatusLine kind={message.kind}>{message.text}</StatusLine>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {!error && loading && offers.length === 0 && (
        <div className="py-6">
          <Quiet>Loading…</Quiet>
        </div>
      )}

      {!error && !loading && offers.length === 0 && (
        <div className="py-12 text-center" style={BOX}>
          <Quiet>No licensing offers yet.</Quiet>
        </div>
      )}

      <div className="space-y-2.5">
        {offers.map((o) => {
          const pending = o.status === "pending_creator";
          const expired = new Date(o.expires_at).getTime() <= Date.now();
          const isCounterOpen = showCounter[o.id] ?? false;
          const isHistoryOpen = showHistory[o.id] ?? false;

          return (
            <div key={o.id} className="p-4" style={BOX}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <a
                    href={`/reels/${o.reel_id}`}
                    className="uppercase transition-colors hover:opacity-70"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      color: "hsl(var(--nl-amber-text))",
                    }}
                  >
                    Reel {o.reel_id.slice(0, 8)}…
                  </a>
                  <div
                    className="mt-1"
                    style={{
                      fontFamily: MAISON_SERIF,
                      fontSize: 22,
                      lineHeight: 1.15,
                      color: "hsl(var(--nl-cacao))",
                    }}
                  >
                    {aed(o.amount_fils)}
                  </div>
                  <div
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 11.5,
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    You receive {aedNet(o.amount_fils)} (after 20% fee)
                  </div>
                </div>
                <Pill tone={STATUS_TONE[o.status]}>{o.status.replace(/_/g, " ")}</Pill>
              </div>

              <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                <div>
                  <div style={META_LABEL}>Rights</div>
                  <div style={META_VALUE}>{SCOPE_LABEL[o.rights_scope]}</div>
                </div>
                <div>
                  <div style={META_LABEL}>Funded</div>
                  <div style={META_VALUE}>{FUNDING_LABEL[o.funding_source]}</div>
                </div>
                <div>
                  <div style={META_LABEL}>Expires</div>
                  <div style={META_VALUE}>
                    {new Date(o.expires_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {o.message && (
                <div
                  className="mt-3"
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontStyle: "italic",
                    fontSize: 14,
                    color: "hsl(var(--nl-russet))",
                  }}
                >
                  “{o.message}”
                </div>
              )}

              {/* Actions for pending_creator offers */}
              {pending && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => act(o.id, "accept")}
                      disabled={busyId === o.id || expired}
                      className={BUTTON_CLASS}
                      style={SMALL_PRIMARY}
                    >
                      {busyId === o.id ? "Working…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      onClick={() => act(o.id, "decline")}
                      disabled={busyId === o.id}
                      className={SECONDARY_BUTTON_CLASS}
                      style={SMALL_SECONDARY}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={busyId === o.id || expired}
                      onClick={() =>
                        setShowCounter((prev) => ({
                          ...prev,
                          [o.id]: !prev[o.id],
                        }))
                      }
                      className={SECONDARY_BUTTON_CLASS}
                      style={SMALL_SECONDARY}
                    >
                      Counter
                    </button>
                    {expired && (
                      <StatusLine kind="err">This offer has expired.</StatusLine>
                    )}
                  </div>

                  {/* Counter inline form */}
                  {isCounterOpen && (
                    <div
                      className="flex flex-wrap items-end gap-3 p-3"
                      style={{
                        border: "1px solid rgba(44,24,16,0.10)",
                        background: "rgba(255,255,255,0.4)",
                      }}
                    >
                      <div className="flex flex-col">
                        <FieldLabel htmlFor={`counter-${o.id}`}>
                          Your ask (AED, min 50)
                        </FieldLabel>
                        <input
                          id={`counter-${o.id}`}
                          type="number"
                          min="50"
                          step="0.01"
                          value={counterAed[o.id] ?? ""}
                          onChange={(e) =>
                            setCounterAed((prev) => ({
                              ...prev,
                              [o.id]: e.target.value,
                            }))
                          }
                          placeholder="e.g. 150"
                          className={`${INPUT_CLASS} w-32`}
                          style={INPUT_STYLE}
                        />
                      </div>
                      <div className="flex flex-col flex-1 min-w-40">
                        <FieldLabel htmlFor={`counter-note-${o.id}`}>
                          Note (optional)
                        </FieldLabel>
                        <input
                          id={`counter-note-${o.id}`}
                          type="text"
                          maxLength={200}
                          value={counterNote[o.id] ?? ""}
                          onChange={(e) =>
                            setCounterNote((prev) => ({
                              ...prev,
                              [o.id]: e.target.value,
                            }))
                          }
                          placeholder="e.g. Happy to license for 6 months"
                          className={INPUT_CLASS}
                          style={INPUT_STYLE}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busyId === o.id}
                        onClick={() => handleCounter(o.id)}
                        className={BUTTON_CLASS}
                        style={SMALL_PRIMARY}
                      >
                        {busyId === o.id ? "Sending…" : "Send counter"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* History toggle (all statuses) */}
              <div className="mt-3.5">
                <button
                  type="button"
                  onClick={() =>
                    setShowHistory((prev) => ({ ...prev, [o.id]: !prev[o.id] }))
                  }
                  className="uppercase transition-colors hover:opacity-70"
                  style={{
                    fontFamily: MAISON_SANS,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "hsl(var(--nl-amber-text))",
                  }}
                >
                  {isHistoryOpen ? "Hide history" : "View history"}
                </button>
                {isHistoryOpen && <OfferHistory offerId={o.id} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
