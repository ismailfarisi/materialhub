import { describe, expect, it, mock } from "bun:test";
import { loadRatings } from "./service-ratings.ts";

describe("loadRatings", () => {
  it("returns an empty map for an empty input without querying", async () => {
    const map = await loadRatings([], {
      runQuery: async () => {
        throw new Error("should not query");
      },
    });
    expect(map.size).toBe(0);
  });

  it("maps only the rows the query returns", async () => {
    // I1: a non-approved (pending/rejected/flagged) review must not
    // contribute to the aggregate. loadRatings itself only maps whatever
    // rows the query hands back — the filtering guarantee lives in the SQL
    // (see the mock.module test below), so this proves the mapping is
    // faithful to that result set: an offering with ONLY non-approved
    // reviews is correctly reported as unrated (absent from the map), not
    // defaulted to a fabricated 0.
    const map = await loadRatings(["o1", "o2"], {
      runQuery: async () => [{ service_offering_id: "o1", avg: "4.50", count: "3" }],
    });
    expect(map.get("o1")).toEqual({ avg: 4.5, count: 3 });
    expect(map.has("o2")).toBe(false);
  });
});

describe("defaultRatingsDeps.runQuery — approved-only filter (I1)", () => {
  it("filters on status::text = 'approved', matching booking-service's posture", async () => {
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    mock.module("@materialhub/database", () => ({
      AppDataSource: {
        query: async (sql: string, params: unknown[]) => {
          capturedSql = sql;
          capturedParams = params;
          return [];
        },
      },
      ServiceReviewStatus: { approved: "approved" },
    }));

    const { defaultRatingsDeps } = await import("./service-ratings.ts");
    await defaultRatingsDeps.runQuery(["o1"]);

    expect(capturedSql).toContain("status::text = $2");
    expect(capturedSql).toContain("r.deleted_at IS NULL");
    expect(capturedParams).toEqual([["o1"], "approved"]);
  });

  it("aggregates through bookings — service_reviews has no service_offering_id of its own (regression)", async () => {
    // Pins the join + grouping column so a revert to the non-existent
    // `service_reviews.service_offering_id` fails this test instead of only
    // surfacing as a 42703 at runtime.
    let capturedSql = "";
    mock.module("@materialhub/database", () => ({
      AppDataSource: {
        query: async (sql: string) => {
          capturedSql = sql;
          return [];
        },
      },
      ServiceReviewStatus: { approved: "approved" },
    }));

    const { defaultRatingsDeps } = await import("./service-ratings.ts");
    await defaultRatingsDeps.runQuery(["o1"]);

    expect(capturedSql).toContain("JOIN bookings b ON b.id = r.booking_id");
    expect(capturedSql).toContain("WHERE b.service_offering_id = ANY($1)");
    expect(capturedSql).toContain("GROUP BY b.service_offering_id");
    expect(capturedSql).toContain("b.deleted_at IS NULL");
  });
});
