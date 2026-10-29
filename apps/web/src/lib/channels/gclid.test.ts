import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureGclidFromLocation,
  readAllClickIds,
  readGclid,
} from "./gclid";

const STORAGE_KEY = "materialhub_gclid";

function setLocation(href: string): void {
  Object.defineProperty(window, "location", {
    value: new URL(href),
    writable: true,
    configurable: true,
  });
}

describe("gclid capture", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setLocation("https://materialhub.example/");
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("does nothing when the URL has no click ids", () => {
    setLocation("https://materialhub.example/?utm_source=foo");
    captureGclidFromLocation();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readGclid()).toBeNull();
    expect(readAllClickIds()).toEqual({});
  });

  it("captures gclid from the URL into sessionStorage", () => {
    setLocation("https://materialhub.example/?gclid=abc123");
    captureGclidFromLocation();
    expect(readGclid()).toBe("abc123");
    expect(readAllClickIds()).toEqual({ gclid: "abc123" });
  });

  it("captures gbraid and wbraid alongside gclid", () => {
    setLocation(
      "https://materialhub.example/?gclid=g1&gbraid=gb1&wbraid=wb1",
    );
    captureGclidFromLocation();
    expect(readAllClickIds()).toEqual({
      gclid: "g1",
      gbraid: "gb1",
      wbraid: "wb1",
    });
  });

  it("merges with existing values — keeps prior gclid when new URL has only gbraid", () => {
    // First visit captures gclid only.
    setLocation("https://materialhub.example/?gclid=first");
    captureGclidFromLocation();
    expect(readAllClickIds()).toEqual({ gclid: "first" });

    // Second navigation captures gbraid only.
    setLocation("https://materialhub.example/landing?gbraid=second");
    captureGclidFromLocation();
    expect(readAllClickIds()).toEqual({ gclid: "first", gbraid: "second" });
    expect(readGclid()).toBe("first");
  });

  it("overwrites a previously stored value when the same key appears again", () => {
    setLocation("https://materialhub.example/?gclid=first");
    captureGclidFromLocation();

    setLocation("https://materialhub.example/?gclid=second");
    captureGclidFromLocation();
    expect(readGclid()).toBe("second");
  });

  it("expires stored ids after 90 days and clears the entry on read", () => {
    setLocation("https://materialhub.example/?gclid=ttl");
    captureGclidFromLocation();
    expect(readGclid()).toBe("ttl");

    // Manually rewrite the entry as if it were captured 91 days ago.
    const ninetyOneDaysAgoExpiry =
      Date.now() - 1 * 24 * 60 * 60 * 1000; // expired 1 day ago
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        values: { gclid: "ttl" },
        expiresAt: ninetyOneDaysAgoExpiry,
      }),
    );

    expect(readGclid()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("returns null and tolerates corrupted JSON in storage", () => {
    sessionStorage.setItem(STORAGE_KEY, "{not json");
    expect(readGclid()).toBeNull();
    expect(readAllClickIds()).toEqual({});
  });

  it("sets an expiry roughly 90 days in the future on capture", () => {
    const before = Date.now();
    setLocation("https://materialhub.example/?gclid=stamp");
    captureGclidFromLocation();
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}") as { expiresAt: number };
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    expect(parsed.expiresAt).toBeGreaterThanOrEqual(before + ninetyDaysMs);
    expect(parsed.expiresAt).toBeLessThanOrEqual(Date.now() + ninetyDaysMs);
  });
});
