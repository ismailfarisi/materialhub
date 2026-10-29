// ical-limits.test.ts
//
// Review finding 1 — the 2 MB `MAX_FEED_BYTES` body cap bounds BYTES, not
// WORK. A minimal VEVENT is ~107 bytes, so a feed at exactly the byte limit
// holds ~19.5k events; giving each `RRULE:FREQ=DAILY` expanded to ~1.8M
// occurrences (measured against this branch before the fix), which is hundreds
// of MB of heap in a 384 MB service AND one serial `engagementService.reserve()`
// — an INSERT plus a cache invalidation — per occurrence, on a concurrency-1
// 15-minute cron. A vendor pointing `ical_url` at a host they control could
// therefore OOM the poller every tick and starve every other vendor's sync.
//
// These tests pin BOTH caps (total parsed VEVENTs and total expanded
// occurrences) and, importantly, that a breach FAILS the sync loudly rather
// than silently importing a truncated subset.
import { describe, expect, it } from "bun:test";
import { IcalLimitExceededError, MAX_PARSED_EVENTS, parseICal } from "./ical-parse.ts";
import { MAX_TOTAL_OCCURRENCES, expandRecurringEvents } from "./ical-recurrence.ts";

const NOW = new Date("2026-07-20T00:00:00Z");

function feedOf(count: number, rrule: string | null): string {
  let out = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n";
  for (let i = 0; i < count; i++) {
    out += "BEGIN:VEVENT\r\n";
    out += `UID:e${i}@example.test\r\n`;
    out += "DTSTART:20260701T090000Z\r\n";
    out += "DTEND:20260701T093000Z\r\n";
    if (rrule) out += `RRULE:${rrule}\r\n`;
    out += "END:VEVENT\r\n";
  }
  return `${out}END:VCALENDAR\r\n`;
}

describe("parseICal — total VEVENT cap", () => {
  it("parses a feed at the cap without throwing", () => {
    const events = parseICal(feedOf(50, null), { maxEvents: 50 });
    expect(events).toHaveLength(50);
  });

  it("throws IcalLimitExceededError past the cap instead of returning a truncated list", () => {
    const err = (() => {
      try {
        parseICal(feedOf(80, null), { maxEvents: 50 });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(IcalLimitExceededError);
    expect((err as IcalLimitExceededError).limit).toBe("too_many_events");
  });

  it("keeps the default cap well under what a 2 MB feed can carry", () => {
    // ~19.5k VEVENTs fit in the 2 MB body cap; the parse cap must be far below
    // that or it bounds nothing in practice.
    expect(MAX_PARSED_EVENTS).toBeLessThan(19_000);
  });

  // The "never throws on malformed input" contract must be intact — only a
  // LIMIT breach is allowed to escape.
  it("still swallows malformed input rather than throwing", () => {
    expect(() => parseICal("this is not a calendar at all")).not.toThrow();
    expect(parseICal("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\ngarbage\r\n")).toEqual([]);
  });
});

describe("expandRecurringEvents — whole-feed occurrence cap", () => {
  it("expands normally below the global cap", () => {
    const result = expandRecurringEvents(parseICal(feedOf(2, "FREQ=DAILY")), { now: NOW });
    // Two daily masters over the 91-day window, per-event cap 500.
    expect(result.events.length).toBeGreaterThan(100);
    expect(result.events.length).toBeLessThan(MAX_TOTAL_OCCURRENCES);
  });

  it("throws past the global cap — the per-event cap alone does NOT bound N events", () => {
    // 40 daily masters × ~91 in-window occurrences each is ~3.6k, comfortably
    // past a 500 global cap while every single event stays under the 500
    // PER-EVENT cap. This is exactly the case the per-event cap missed.
    const events = parseICal(feedOf(40, "FREQ=DAILY"));
    const err = (() => {
      try {
        expandRecurringEvents(events, { now: NOW, maxTotalOccurrences: 500 });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(IcalLimitExceededError);
    expect((err as IcalLimitExceededError).limit).toBe("too_many_occurrences");
  });

  it("bounds the reviewer's reproduction: a 2 MB-equivalent all-recurring feed", () => {
    // Same shape as the proven repro, at a size the test suite can run fast.
    // Before the fix this returned ~1.8M occurrences; now it must refuse.
    const events = parseICal(feedOf(1000, "FREQ=DAILY"), { maxEvents: 5000 });
    expect(() => expandRecurringEvents(events, { now: NOW })).toThrow(IcalLimitExceededError);
  });

  it("non-recurring events are counted against the global cap too", () => {
    const events = parseICal(feedOf(30, null));
    expect(() => expandRecurringEvents(events, { now: NOW, maxTotalOccurrences: 10 })).toThrow(
      IcalLimitExceededError,
    );
  });
});
