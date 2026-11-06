import { describe, expect, it } from "bun:test";
import {
  QuoteRequestStatus as R,
  QuoteResponseStatus as S,
  QuoteVendorStatus as V,
} from "@materialhub/database/src/enums/quote.enums.ts";
import {
  QuoteRuleError,
  assertAcceptable,
  assertNeedByDate,
  assertResponseInput,
  canMessage,
  deriveRequestStatus,
  dubaiToday,
  formatRequestNumber,
  isQuoteExpired,
  isTerminalVendorStatus,
  nextVendorStatus,
  normaliseVendorIds,
  responseDisplayState,
} from "./quote-state-machine.ts";

// 2026-11-06 10:00 in Dubai (06:00 UTC).
const NOW = new Date("2026-11-06T06:00:00Z");

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof QuoteRuleError ? err.code : String(err);
  }
}

describe("supplier-side transitions", () => {
  it("a pending supplier can respond, decline, or be cancelled", () => {
    expect(nextVendorStatus(V.pending, "respond")).toBe(V.responded);
    expect(nextVendorStatus(V.pending, "vendor_decline")).toBe(V.vendor_declined);
    expect(nextVendorStatus(V.pending, "cancel")).toBe(V.cancelled);
    expect(nextVendorStatus(V.pending, "not_selected")).toBe(V.not_selected);
  });

  it("a buyer can't accept or decline before the supplier quotes", () => {
    expect(code(() => nextVendorStatus(V.pending, "accept"))).toBe("INVALID_TRANSITION");
    expect(code(() => nextVendorStatus(V.pending, "buyer_decline"))).toBe("INVALID_TRANSITION");
  });

  it("a responded supplier can revise, and the buyer can accept or decline", () => {
    expect(nextVendorStatus(V.responded, "respond")).toBe(V.responded);
    expect(nextVendorStatus(V.responded, "accept")).toBe(V.accepted);
    expect(nextVendorStatus(V.responded, "buyer_decline")).toBe(V.buyer_declined);
  });

  it("a supplier can re-quote after the buyer declines", () => {
    expect(nextVendorStatus(V.buyer_declined, "respond")).toBe(V.responded);
    expect(code(() => nextVendorStatus(V.buyer_declined, "accept"))).toBe("INVALID_TRANSITION");
  });

  it("terminal states accept no actions", () => {
    for (const s of [V.accepted, V.not_selected, V.vendor_declined, V.cancelled]) {
      expect(isTerminalVendorStatus(s)).toBe(true);
      for (const a of ["respond", "accept", "cancel", "vendor_decline"] as const) {
        expect(code(() => nextVendorStatus(s, a))).toBe("INVALID_TRANSITION");
      }
    }
    expect(isTerminalVendorStatus(V.pending)).toBe(false);
  });
});

describe("request status is derived from its suppliers", () => {
  it("open while everyone is pending", () => {
    expect(deriveRequestStatus([V.pending, V.pending])).toBe(R.open);
  });

  it("quoted once any supplier has a live response", () => {
    expect(deriveRequestStatus([V.pending, V.responded, V.vendor_declined])).toBe(R.quoted);
  });

  it("accepted when one supplier is accepted", () => {
    expect(deriveRequestStatus([V.accepted, V.not_selected, V.vendor_declined])).toBe(R.accepted);
  });

  it("closed when every supplier declined", () => {
    expect(deriveRequestStatus([V.vendor_declined, V.vendor_declined])).toBe(R.closed);
  });

  it("open, not closed, when a declined quote can still be revised", () => {
    expect(deriveRequestStatus([V.vendor_declined, V.buyer_declined])).toBe(R.open);
  });

  it("cancelled when every side is cancelled", () => {
    expect(deriveRequestStatus([V.cancelled, V.cancelled])).toBe(R.cancelled);
  });
});

describe("dates use the Dubai calendar", () => {
  it("rolls over at midnight Dubai time, not UTC", () => {
    // 21:30 UTC on 6 Nov is 01:30 on 7 Nov in Dubai.
    expect(dubaiToday(new Date("2026-11-06T21:30:00Z"))).toBe("2026-11-07");
    expect(dubaiToday(new Date("2026-11-06T19:59:00Z"))).toBe("2026-11-06");
  });

  it("a quote is valid through the end of its valid-until day", () => {
    expect(isQuoteExpired("2026-11-06", NOW)).toBe(false);
    expect(isQuoteExpired("2026-11-05", NOW)).toBe(true);
    // 23:59 Dubai on the valid-until day is still valid.
    expect(isQuoteExpired("2026-11-06", new Date("2026-11-06T19:59:00Z"))).toBe(false);
    // 00:01 Dubai the next day is not.
    expect(isQuoteExpired("2026-11-06", new Date("2026-11-06T20:01:00Z"))).toBe(true);
  });

  it("rejects a need-by date in the past or malformed", () => {
    expect(code(() => assertNeedByDate("2026-11-05", NOW))).toBe("INVALID_INPUT");
    expect(code(() => assertNeedByDate("2026-02-30", NOW))).toBe("INVALID_INPUT");
    expect(code(() => assertNeedByDate("06/11/2026", NOW))).toBe("INVALID_INPUT");
    expect(code(() => assertNeedByDate("2026-11-06", NOW))).toBeNull();
    expect(code(() => assertNeedByDate(null, NOW))).toBeNull();
  });
});

describe("request creation rules", () => {
  it("dedupes suppliers and allows up to three", () => {
    expect(normaliseVendorIds(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });

  it("rejects more than three suppliers", () => {
    expect(code(() => normaliseVendorIds(["a", "b", "c", "d"]))).toBe("TOO_MANY_VENDORS");
  });

  it("rejects an empty supplier list", () => {
    expect(code(() => normaliseVendorIds([]))).toBe("NO_VENDORS");
  });

  it("formats request numbers", () => {
    expect(formatRequestNumber(2026, 42)).toBe("RFQ-2026-000042");
  });
});

describe("response input rules", () => {
  const ok = { unit_price: 365, moq: 500, lead_time_days: 7, valid_until: "2026-11-20" };

  it("accepts a well-formed response", () => {
    expect(code(() => assertResponseInput(ok, NOW))).toBeNull();
  });

  it("requires whole positive fils, a positive MOQ and a non-negative lead time", () => {
    expect(code(() => assertResponseInput({ ...ok, unit_price: 0 }, NOW))).toBe("INVALID_INPUT");
    expect(code(() => assertResponseInput({ ...ok, unit_price: 3.65 }, NOW))).toBe("INVALID_INPUT");
    expect(code(() => assertResponseInput({ ...ok, moq: 0 }, NOW))).toBe("INVALID_INPUT");
    expect(code(() => assertResponseInput({ ...ok, lead_time_days: -1 }, NOW))).toBe(
      "INVALID_INPUT",
    );
  });

  it("rejects a validity date already in the past", () => {
    expect(code(() => assertResponseInput({ ...ok, valid_until: "2026-11-05" }, NOW))).toBe(
      "INVALID_INPUT",
    );
  });
});

describe("acceptance rules", () => {
  const live = { id: "resp-1", status: S.submitted, valid_until: "2026-11-20", moq: 500 };
  const base = {
    requestStatus: R.quoted,
    vendorStatus: V.responded,
    response: live,
    currentResponseId: "resp-1",
    requestedQuantity: 1000,
  };

  it("accepts a live response and keeps the requested quantity", () => {
    expect(assertAcceptable(base, NOW)).toEqual({ quantity: 1000 });
  });

  it("raises the cart quantity to the supplier's MOQ", () => {
    expect(assertAcceptable({ ...base, requestedQuantity: 200 }, NOW)).toEqual({ quantity: 500 });
  });

  it("refuses an expired quote", () => {
    const expired = { ...base, response: { ...live, valid_until: "2026-11-05" } };
    expect(code(() => assertAcceptable(expired, NOW))).toBe("QUOTE_EXPIRED");
  });

  it("accepts on the last valid day", () => {
    const lastDay = { ...base, response: { ...live, valid_until: "2026-11-06" } };
    expect(assertAcceptable(lastDay, NOW).quantity).toBe(1000);
  });

  it("refuses a superseded or declined response", () => {
    expect(
      code(() => assertAcceptable({ ...base, response: { ...live, status: S.superseded } }, NOW)),
    ).toBe("NO_LIVE_RESPONSE");
    expect(
      code(() => assertAcceptable({ ...base, response: { ...live, status: S.declined } }, NOW)),
    ).toBe("NO_LIVE_RESPONSE");
  });

  it("refuses a response that isn't the supplier's current one", () => {
    expect(code(() => assertAcceptable({ ...base, currentResponseId: "resp-2" }, NOW))).toBe(
      "NO_LIVE_RESPONSE",
    );
  });

  it("refuses when the supplier hasn't quoted", () => {
    expect(
      code(() =>
        assertAcceptable(
          { ...base, vendorStatus: V.pending, response: null, currentResponseId: null },
          NOW,
        ),
      ),
    ).toBe("NO_LIVE_RESPONSE");
  });

  it("refuses a second acceptance", () => {
    expect(code(() => assertAcceptable({ ...base, requestStatus: R.accepted }, NOW))).toBe(
      "ALREADY_ACCEPTED",
    );
    expect(code(() => assertAcceptable({ ...base, vendorStatus: V.accepted }, NOW))).toBe(
      "ALREADY_ACCEPTED",
    );
  });

  it("refuses on a cancelled or closed request", () => {
    expect(code(() => assertAcceptable({ ...base, requestStatus: R.cancelled }, NOW))).toBe(
      "REQUEST_CLOSED",
    );
    expect(code(() => assertAcceptable({ ...base, requestStatus: R.closed }, NOW))).toBe(
      "REQUEST_CLOSED",
    );
  });

  it("refuses a supplier the buyer already declined, until they re-quote", () => {
    expect(code(() => assertAcceptable({ ...base, vendorStatus: V.buyer_declined }, NOW))).toBe(
      "INVALID_TRANSITION",
    );
  });
});

describe("display state and messaging", () => {
  it("labels responses for comparison", () => {
    expect(responseDisplayState({ status: S.submitted, valid_until: "2026-11-20" }, NOW)).toBe(
      "live",
    );
    expect(responseDisplayState({ status: S.submitted, valid_until: "2026-11-01" }, NOW)).toBe(
      "expired",
    );
    expect(responseDisplayState({ status: S.accepted, valid_until: "2026-11-01" }, NOW)).toBe(
      "accepted",
    );
    expect(responseDisplayState({ status: S.superseded, valid_until: "2026-11-20" }, NOW)).toBe(
      "superseded",
    );
  });

  it("keeps threads open after acceptance but closes them on cancellation", () => {
    expect(canMessage(R.accepted, V.accepted)).toBe(true);
    expect(canMessage(R.accepted, V.not_selected)).toBe(true);
    expect(canMessage(R.cancelled, V.cancelled)).toBe(false);
  });
});
