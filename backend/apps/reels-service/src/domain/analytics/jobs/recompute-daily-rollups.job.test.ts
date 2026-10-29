import { describe, expect, it } from "bun:test";
import { datesToRecompute } from "./recompute-daily-rollups.job.ts";

describe("datesToRecompute", () => {
  it("returns exactly 14 bucket_dates, today-14 through today-1, newest first", () => {
    const today = new Date("2026-04-20T02:15:00Z");
    const dates = datesToRecompute(today, 14);
    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe("2026-04-19");
    expect(dates[13]).toBe("2026-04-06");
  });

  it("window of 1 returns a single date (today-1)", () => {
    const today = new Date("2026-04-20T00:00:00Z");
    expect(datesToRecompute(today, 1)).toEqual(["2026-04-19"]);
  });
});
