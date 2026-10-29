import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted by Vitest BEFORE the module-under-test imports. The registry is a
// module-level singleton, so we mock it to inject fake channels per test
// without polluting other test files in the same vitest run.
vi.mock("./registry", () => ({
  getRegisteredChannels: vi.fn(() => [] as ChannelDescriptor[]),
  registerChannel: vi.fn(),
}));

// Consent is also mocked so each test can inject a decision (accepted vs not)
// without rendering a real <ConsentProvider>.
let mockDecision: "accepted" | "rejected" | null = "accepted";
vi.mock("@/lib/consent/consent-state", () => ({
  useConsent: () => ({
    decision: mockDecision,
    setDecision: vi.fn(),
  }),
  hasConsent: (d: "accepted" | "rejected" | null) => d === "accepted",
}));

import * as registryModule from "./registry";
import type {
  BrowserEvent,
  ChannelDescriptor,
  EventPayload,
} from "./types";
import { useChannelEvents } from "./use-channel-events";

const GCLID_STORAGE_KEY = "materialhub_gclid";
const EVENT_ID_STORAGE_KEY = "materialhub_event_ids";

function setRegistered(channels: ChannelDescriptor[]): void {
  (
    registryModule.getRegisteredChannels as ReturnType<typeof vi.fn>
  ).mockReturnValue(channels);
}

function makeChannel(
  id: string,
  fire?: (event: BrowserEvent, payload: EventPayload) => void,
): { descriptor: ChannelDescriptor; fire: ReturnType<typeof vi.fn> } {
  const fireFn = vi.fn(fire ?? (() => {}));
  return {
    descriptor: { id, fire: fireFn },
    fire: fireFn,
  };
}

beforeEach(() => {
  mockDecision = "accepted";
  sessionStorage.clear();
  setRegistered([]);
});

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("useChannelEvents", () => {
  it("returns no-op when consent decision is not 'accepted'", () => {
    mockDecision = null;
    const ch = makeChannel("google");
    setRegistered([ch.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() => result.current.fire("PageView"));

    expect(ch.fire).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(EVENT_ID_STORAGE_KEY)).toBeNull();
  });

  it("does not fire when consent decision is 'rejected'", () => {
    mockDecision = "rejected";
    const ch = makeChannel("google");
    setRegistered([ch.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() => result.current.fire("PageView"));

    expect(ch.fire).not.toHaveBeenCalled();
  });

  it("calls each registered channel's fire with the enriched payload", () => {
    const a = makeChannel("google");
    const b = makeChannel("meta");
    setRegistered([a.descriptor, b.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() =>
      result.current.fire("ViewContent", {
        product_id: "prod-1",
        product_name: "Saffron Oud",
        currency: "AED",
        value_fils: 12_500,
      }),
    );

    expect(a.fire).toHaveBeenCalledTimes(1);
    expect(b.fire).toHaveBeenCalledTimes(1);

    const [eventName, payload] = a.fire.mock.calls[0] as [
      BrowserEvent,
      EventPayload,
    ];
    expect(eventName).toBe("ViewContent");
    expect(payload.product_id).toBe("prod-1");
    expect(payload.product_name).toBe("Saffron Oud");
    expect(payload.currency).toBe("AED");
    expect(payload.value_fils).toBe(12_500);
    expect(payload.event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    // Non-Purchase events must NOT carry transaction_id.
    expect(payload.transaction_id).toBeUndefined();
    // gclid is nulled when sessionStorage has none.
    expect(payload.gclid).toBeNull();

    // Both channels see the same enriched payload (same event_id).
    expect((b.fire.mock.calls[0] as unknown[])[1]).toEqual(payload);
  });

  it("generates DIFFERENT event_ids for different (event, dedupKey) pairs", () => {
    const ch = makeChannel("google");
    setRegistered([ch.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() => result.current.fire("PageView"));
    act(() => result.current.fire("ViewContent", { product_id: "p1" }));
    act(() =>
      result.current.fire("Purchase", { order_id: "ord-1", value_fils: 100 }),
    );
    act(() =>
      result.current.fire("Purchase", { order_id: "ord-2", value_fils: 200 }),
    );

    expect(ch.fire).toHaveBeenCalledTimes(4);
    const ids = ch.fire.mock.calls.map(
      (c) => (c as [BrowserEvent, EventPayload])[1].event_id,
    );
    expect(new Set(ids).size).toBe(4);
  });

  it("generates a FRESH event_id on every non-Purchase fire (SPA navigation safety)", () => {
    // Activity events must NOT cache by event-name — otherwise every PageView
    // in a tab session would share one id for 7 days.
    const ch = makeChannel("google");
    setRegistered([ch.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() => result.current.fire("PageView"));
    act(() => result.current.fire("PageView"));
    act(() => result.current.fire("ViewContent", { product_id: "p1" }));
    act(() => result.current.fire("ViewContent", { product_id: "p1" }));
    act(() => result.current.fire("AddToCart", { product_id: "p1" }));

    expect(ch.fire).toHaveBeenCalledTimes(5);
    const ids = ch.fire.mock.calls.map(
      (c) => (c as [BrowserEvent, EventPayload])[1].event_id,
    );
    // All 5 must be unique despite repeating event names and repeating payloads.
    expect(new Set(ids).size).toBe(5);
  });

  it("returns the SAME event_id for repeated Purchase calls with the same order_id (dedup contract)", () => {
    const ch = makeChannel("google");
    setRegistered([ch.descriptor]);

    const { result } = renderHook(() => useChannelEvents());

    act(() =>
      result.current.fire("Purchase", {
        order_id: "ord-stable",
        value_fils: 5000,
      }),
    );
    act(() =>
      result.current.fire("Purchase", {
        order_id: "ord-stable",
        value_fils: 5000,
      }),
    );

    expect(ch.fire).toHaveBeenCalledTimes(2);
    const [, first] = ch.fire.mock.calls[0] as [BrowserEvent, EventPayload];
    const [, second] = ch.fire.mock.calls[1] as [BrowserEvent, EventPayload];
    expect(first.event_id).toBe(second.event_id);
    expect(first.transaction_id).toBe("ord-stable");
    expect(second.transaction_id).toBe("ord-stable");
  });

  it("sets transaction_id on Purchase and not on other events", () => {
    const ch = makeChannel("google");
    setRegistered([ch.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() =>
      result.current.fire("AddToCart", {
        product_id: "p1",
        order_id: "ignored-on-add-to-cart",
      }),
    );
    act(() =>
      result.current.fire("Purchase", {
        order_id: "ord-7",
        value_fils: 9999,
      }),
    );

    const addCall = ch.fire.mock.calls[0] as [BrowserEvent, EventPayload];
    const purchaseCall = ch.fire.mock.calls[1] as [BrowserEvent, EventPayload];
    expect(addCall[1].transaction_id).toBeUndefined();
    expect(purchaseCall[1].transaction_id).toBe("ord-7");
  });

  it("one channel throwing does not prevent the others from firing", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const exploding = makeChannel("broken", () => {
      throw new Error("boom");
    });
    const after = makeChannel("ok");
    const before = makeChannel("before");
    setRegistered([before.descriptor, exploding.descriptor, after.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() => result.current.fire("PageView"));

    expect(before.fire).toHaveBeenCalledTimes(1);
    expect(exploding.fire).toHaveBeenCalledTimes(1);
    expect(after.fire).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[channels] broken fire failed",
      "PageView",
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("adds gclid to payload from sessionStorage when present", () => {
    sessionStorage.setItem(
      GCLID_STORAGE_KEY,
      JSON.stringify({
        values: { gclid: "click-xyz" },
        expiresAt: Date.now() + 60_000,
      }),
    );

    const ch = makeChannel("google");
    setRegistered([ch.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() => result.current.fire("AddToCart", { product_id: "p1" }));

    const [, payload] = ch.fire.mock.calls[0] as [BrowserEvent, EventPayload];
    expect(payload.gclid).toBe("click-xyz");
  });

  it("nulls gclid when sessionStorage holds no click ids", () => {
    const ch = makeChannel("google");
    setRegistered([ch.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() => result.current.fire("PageView"));

    const [, payload] = ch.fire.mock.calls[0] as [BrowserEvent, EventPayload];
    expect(payload.gclid).toBeNull();
  });

  it("does not include order_id in the enriched payload for non-Purchase events when not provided", () => {
    const ch = makeChannel("google");
    setRegistered([ch.descriptor]);

    const { result } = renderHook(() => useChannelEvents());
    act(() => result.current.fire("PageView"));

    const [, payload] = ch.fire.mock.calls[0] as [BrowserEvent, EventPayload];
    expect(payload.order_id).toBeUndefined();
  });

  it("persists Purchase event_id to sessionStorage so a fresh hook returns the same id (page-refresh dedup)", () => {
    const ch1 = makeChannel("google");
    setRegistered([ch1.descriptor]);

    const { result: r1 } = renderHook(() => useChannelEvents());
    act(() =>
      r1.current.fire("Purchase", {
        order_id: "ord-refresh",
        value_fils: 100,
      }),
    );
    const [, firstPayload] = ch1.fire.mock.calls[0] as [
      BrowserEvent,
      EventPayload,
    ];

    // Simulate a page-refresh: new hook instance, new channel mock — but
    // sessionStorage survives within the same jsdom session.
    const ch2 = makeChannel("google");
    setRegistered([ch2.descriptor]);

    const { result: r2 } = renderHook(() => useChannelEvents());
    act(() =>
      r2.current.fire("Purchase", {
        order_id: "ord-refresh",
        value_fils: 100,
      }),
    );
    const [, secondPayload] = ch2.fire.mock.calls[0] as [
      BrowserEvent,
      EventPayload,
    ];

    expect(secondPayload.event_id).toBe(firstPayload.event_id);
  });
});
