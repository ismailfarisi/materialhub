import { describe, expect, it } from "bun:test";
import { CreatorDirectoryService } from "./creator-directory.service.ts";

/**
 * The service's single raw-SQL call is behind a protected `runQuery`, so these
 * tests drive the real parameter-building and row-mapping logic and assert on
 * the SQL text handed to Postgres. The query is executed for real against a
 * live database in tests/integration/creator-directory.test.ts.
 */
class TestDirectoryService extends CreatorDirectoryService {
  calls: Array<{ sql: string; args: unknown[] }> = [];
  rows: unknown[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: test double returns arbitrary raw rows
  protected override async runQuery(sql: string, args: unknown[]): Promise<any[]> {
    this.calls.push({ sql, args });
    // biome-ignore lint/suspicious/noExplicitAny: test double returns arbitrary raw rows
    return this.rows as any[];
  }
}

function makeService(rows: unknown[] = []) {
  const svc = new TestDirectoryService();
  svc.rows = rows;
  return svc;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  display_name: "Aisha Glow",
  bio: "Skincare tips",
  primary_category: "Skincare",
  avatar_url: "https://cdn/u1.webp",
  intro_video_url: "https://cdn/u1-intro.mp4",
  sample_count: 3,
  ...over,
});

describe("CreatorDirectoryService.list — who is listed", () => {
  it("restricts to approved creators that still exist", async () => {
    const svc = makeService();
    await svc.list({});
    const { sql } = svc.calls[0]!;
    expect(sql).toContain("u.creator_tier <> 'regular'");
    expect(sql).toContain("u.deleted_at IS NULL");
  });

  it("requires an approved application via an inner LATERAL join", async () => {
    // JOIN LATERAL (not LEFT JOIN) is what drops a creator whose only
    // application is pending/rejected — the exclusion is structural, so
    // assert the join kind, not just the status literal.
    const svc = makeService();
    await svc.list({});
    const { sql } = svc.calls[0]!;
    expect(sql).toContain("JOIN LATERAL");
    expect(sql).toContain("a.status = 'approved'");
    expect(sql).toContain("a.deleted_at IS NULL");
  });

  it("orders creators with an avatar or intro video first, then by most recently graduated", async () => {
    const svc = makeService();
    await svc.list({});
    const { sql } = svc.calls[0]!;
    expect(sql).toContain("ORDER BY (u.avatar_url IS NULL AND intro.video_url IS NULL)");
    expect(sql).toContain("u.creator_tier_earned_at DESC NULLS LAST, u.created_at DESC");
  });

  it("passes no filter arguments when neither search nor category is given", async () => {
    const svc = makeService();
    await svc.list({});
    expect(svc.calls[0]!.args).toEqual([24, 0]);
  });
});

describe("CreatorDirectoryService.list — search", () => {
  it("matches display_name or bio, case-insensitively", async () => {
    const svc = makeService();
    await svc.list({ search: "glow" });
    const { sql, args } = svc.calls[0]!;
    expect(sql).toContain("ca.display_name ILIKE $3");
    expect(sql).toContain("ca.bio ILIKE $3");
    expect(args[2]).toBe("%glow%");
  });

  it("escapes ILIKE metacharacters so '30%' and 'SPF_50' stay literal", async () => {
    const svc = makeService();
    await svc.list({ search: "SPF_50%" });
    const { sql, args } = svc.calls[0]!;
    expect(args[2]).toBe("%SPF\\_50\\%%");
    expect(sql).toContain("ESCAPE '\\'");
  });

  it("ignores an empty search string", async () => {
    const svc = makeService();
    await svc.list({ search: "" });
    expect(svc.calls[0]!.args).toEqual([24, 0]);
  });
});

describe("CreatorDirectoryService.list — category", () => {
  it("filters on an exact primary_category match", async () => {
    const svc = makeService();
    await svc.list({ category: "Makeup" });
    const { sql, args } = svc.calls[0]!;
    expect(sql).toContain("ca.primary_category = $3");
    expect(args[2]).toBe("Makeup");
  });

  it("numbers placeholders correctly when search and category are combined", async () => {
    const svc = makeService();
    await svc.list({ search: "glow", category: "Makeup" });
    const { sql, args } = svc.calls[0]!;
    expect(args).toEqual([24, 0, "%glow%", "Makeup"]);
    expect(sql).toContain("ca.primary_category = $4");
  });
});

describe("CreatorDirectoryService.list — pagination clamps", () => {
  it("caps limit at 60", async () => {
    const svc = makeService();
    await svc.list({ limit: 500 });
    expect(svc.calls[0]!.args[0]).toBe(60);
  });

  it("floors limit at 1 and defaults a missing/zero limit to 24", async () => {
    const svc = makeService();
    await svc.list({ limit: -5 });
    expect(svc.calls[0]!.args[0]).toBe(1);
    await svc.list({ limit: 0 });
    expect(svc.calls[1]!.args[0]).toBe(24);
  });

  it("never sends a negative offset", async () => {
    const svc = makeService();
    await svc.list({ offset: -10 });
    expect(svc.calls[0]!.args[1]).toBe(0);
  });
});

describe("CreatorDirectoryService.list — row mapping", () => {
  it("maps a fully populated row to a card", async () => {
    const svc = makeService([row()]);
    const { items } = await svc.list({});
    expect(items).toEqual([
      {
        id: "u1",
        display_name: "Aisha Glow",
        bio: "Skincare tips",
        primary_category: "Skincare",
        avatar_url: "https://cdn/u1.webp",
        intro_video_url: "https://cdn/u1-intro.mp4",
        sample_count: 3,
      },
    ]);
  });

  it("returns null media and a zero count for a creator with no videos", async () => {
    const svc = makeService([row({ intro_video_url: null, sample_count: 0, avatar_url: null })]);
    const { items } = await svc.list({});
    expect(items[0]!.intro_video_url).toBeNull();
    expect(items[0]!.avatar_url).toBeNull();
    expect(items[0]!.sample_count).toBe(0);
  });

  it("coerces a string-typed count to a number", async () => {
    const svc = makeService([row({ sample_count: "4" })]);
    const { items } = await svc.list({});
    expect(items[0]!.sample_count).toBe(4);
  });

  it("returns an empty list, not null, when nothing matches", async () => {
    const svc = makeService([]);
    await expect(svc.list({ search: "nobody" })).resolves.toEqual({ items: [] });
  });
});
