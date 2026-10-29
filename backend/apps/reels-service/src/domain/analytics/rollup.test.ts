import { describe, expect, it } from "bun:test";
import { resolvePeriod } from "./rollup.service.ts";

describe("resolvePeriod", () => {
  it("7d returns from=today-6 to=today (inclusive, 7 bucket_dates)", () => {
    const today = new Date("2026-04-20T00:00:00Z");
    const { from, to } = resolvePeriod("7d", today);
    expect(to).toBe("2026-04-20");
    expect(from).toBe("2026-04-14");
  });

  it("30d returns from=today-29", () => {
    const today = new Date("2026-04-20T00:00:00Z");
    const { from, to } = resolvePeriod("30d", today);
    expect(from).toBe("2026-03-22");
  });

  it("all returns a very early from date", () => {
    const today = new Date("2026-04-20T00:00:00Z");
    const { from, to } = resolvePeriod("all", today);
    expect(from).toBe("2000-01-01");
    expect(to).toBe("2026-04-20");
  });

  it("previous-period (30d) returns days -60..-31", () => {
    const today = new Date("2026-04-20T00:00:00Z");
    const { from, to } = resolvePeriod("30d", today, { previous: true });
    expect(to).toBe("2026-03-21");
    expect(from).toBe("2026-02-20");
  });
});
