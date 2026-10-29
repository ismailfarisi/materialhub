import { describe, expect, it } from "bun:test";
import { type CreatorMediaKitDetail, CreatorMediaKitService } from "./creator-media-kit.service.ts";

/**
 * `getForVendor`'s single raw-SQL call sits behind a protected `runQuery`, so
 * these tests drive the real row-mapping and assert on the SQL handed to
 * Postgres — the same seam creator-directory.test.ts uses.
 *
 * `upsert` is exercised against a stub repository: the interesting logic is the
 * merge (absent fields keep their stored value) and the normalisation, neither
 * of which needs a database.
 */
class TestMediaKitService extends CreatorMediaKitService {
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
  const svc = new TestMediaKitService();
  svc.rows = rows;
  return svc;
}

const kit = (over: Record<string, unknown> = {}) => ({
  headline: "Beauty & Makeup Creator",
  pull_quote: "Be your own kind of beautiful",
  about: "Beauty lover & content creator.",
  location_label: "Dubai, UAE",
  collaboration_note: "Open to brand collaborations.",
  stats: [{ label: "Followers", value: "68K+" }],
  content_types: ["Makeup Tutorials"],
  audience: [{ label: "Women 18-24", percent: 72 }],
  top_locations: [{ label: "UAE", percent: 61 }],
  is_published: true,
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  display_name: "Aisha Glow",
  bio: "Skincare tips",
  primary_category: "Skincare",
  avatar_url: "https://cdn/u1.webp",
  intro_video_url: "https://cdn/u1-intro.mp4",
  kit: kit(),
  samples: [{ id: "v1", video_url: "https://cdn/v1.mp4", caption: "Product review" }],
  ...over,
});

// ── Stub repository for upsert ───────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: stand-in for a TypeORM repository
function stubRepo(existing: any = null) {
  const saved: any[] = [];
  return {
    saved,
    repo: {
      async findOne() {
        return existing;
      },
      // biome-ignore lint/suspicious/noExplicitAny: mirrors Repository.create
      create(input: any) {
        return { ...input };
      },
      // biome-ignore lint/suspicious/noExplicitAny: mirrors Repository.save
      async save(entity: any) {
        saved.push(entity);
        return entity;
      },
      // biome-ignore lint/suspicious/noExplicitAny: only the three methods above are used
    } as any,
  };
}

describe("CreatorMediaKitService.getForVendor — who resolves", () => {
  it("requires an approved application and a non-regular, live user", async () => {
    const svc = makeService([row()]);
    await svc.getForVendor("u1");
    const { sql, args } = svc.calls[0]!;
    expect(sql).toContain("JOIN LATERAL");
    expect(sql).toContain("a.status = 'approved'");
    expect(sql).toContain("u.creator_tier <> 'regular'");
    expect(sql).toContain("u.deleted_at IS NULL");
    expect(args).toEqual(["u1"]);
  });

  it("returns null when the id is not an approved creator", async () => {
    const svc = makeService([]);
    await expect(svc.getForVendor("nobody")).resolves.toBeNull();
  });
});

describe("CreatorMediaKitService.getForVendor — what a vendor may see", () => {
  it("never reads a contact route out of the database", async () => {
    // The contract this page rests on: a vendor reaches a creator through a
    // collab invite. social_links exists on creator_applications, so the
    // guarantee has to be that the column is never selected at all.
    const svc = makeService([row()]);
    await svc.getForVendor("u1");
    const { sql } = svc.calls[0]!;
    expect(sql).not.toContain("social_links");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("phone");
  });

  it("omits contact fields from the mapped payload", async () => {
    const svc = makeService([
      // Even if a future join were to widen the row, mapping is explicit.
      row({ social_links: { instagram: "@aisha" }, email: "a@example.com" }),
    ]);
    const detail = (await svc.getForVendor("u1")) as CreatorMediaKitDetail;
    expect(detail).not.toHaveProperty("social_links");
    expect(detail).not.toHaveProperty("email");
  });

  it("maps a published kit onto the creator's identity and videos", async () => {
    const svc = makeService([row()]);
    const detail = (await svc.getForVendor("u1")) as CreatorMediaKitDetail;
    expect(detail.display_name).toBe("Aisha Glow");
    expect(detail.has_media_kit).toBe(true);
    expect(detail.headline).toBe("Beauty & Makeup Creator");
    expect(detail.stats).toEqual([{ label: "Followers", value: "68K+" }]);
    expect(detail.audience).toEqual([{ label: "Women 18-24", percent: 72 }]);
    expect(detail.intro_video_url).toBe("https://cdn/u1-intro.mp4");
    expect(detail.samples).toHaveLength(1);
  });

  it("selects only a published kit", async () => {
    const svc = makeService([row()]);
    await svc.getForVendor("u1");
    expect(svc.calls[0]!.sql).toContain("k.is_published = true");
  });

  it("still returns identity and videos when there is no published kit", async () => {
    // An unpublished kit arrives as a NULL join, exactly like a missing one.
    const svc = makeService([row({ kit: null })]);
    const detail = (await svc.getForVendor("u1")) as CreatorMediaKitDetail;
    expect(detail.has_media_kit).toBe(false);
    expect(detail.display_name).toBe("Aisha Glow");
    expect(detail.intro_video_url).toBe("https://cdn/u1-intro.mp4");
    expect(detail.headline).toBeNull();
    expect(detail.stats).toEqual([]);
    expect(detail.content_types).toEqual([]);
    expect(detail.audience).toEqual([]);
    expect(detail.top_locations).toEqual([]);
  });

  it("returns empty lists, not null, for a creator with no sample videos", async () => {
    const svc = makeService([row({ samples: null, intro_video_url: null, avatar_url: null })]);
    const detail = (await svc.getForVendor("u1")) as CreatorMediaKitDetail;
    expect(detail.samples).toEqual([]);
    expect(detail.intro_video_url).toBeNull();
    expect(detail.avatar_url).toBeNull();
  });
});

describe("CreatorMediaKitService.upsert — merge semantics", () => {
  it("creates a kit with empty lists when the creator has never saved one", async () => {
    const { repo, saved } = stubRepo(null);
    const svc = new CreatorMediaKitService(repo);
    await svc.upsert("u1", { headline: "Beauty Creator" });
    expect(saved[0].user_id).toBe("u1");
    expect(saved[0].headline).toBe("Beauty Creator");
    expect(saved[0].stats).toEqual([]);
    expect(saved[0].content_types).toEqual([]);
  });

  it("leaves stored fields untouched when they are absent from the input", async () => {
    // The editor saves one section at a time, so a PUT carrying only the
    // "about" fields must not blank the page the creator has already written.
    const { repo, saved } = stubRepo({
      user_id: "u1",
      headline: "Beauty Creator",
      about: "About me",
      stats: [{ label: "Followers", value: "68K+" }],
      content_types: ["Makeup Tutorials"],
      audience: [],
      top_locations: [],
      is_published: false,
    });
    const svc = new CreatorMediaKitService(repo);
    await svc.upsert("u1", { pull_quote: "Be your own kind of beautiful" });
    expect(saved[0].pull_quote).toBe("Be your own kind of beautiful");
    expect(saved[0].headline).toBe("Beauty Creator");
    expect(saved[0].about).toBe("About me");
    expect(saved[0].stats).toEqual([{ label: "Followers", value: "68K+" }]);
  });

  it("publishes on every save — there is no draft state", async () => {
    // Saving is the only commit point in the editor, so a kit stored as
    // unpublished (written before the publish toggle was removed) becomes
    // visible the moment its owner saves any section.
    const { repo, saved } = stubRepo({ user_id: "u1", is_published: false });
    const svc = new CreatorMediaKitService(repo);
    await svc.upsert("u1", { about: "About me" });
    expect(saved[0].is_published).toBe(true);
  });

  it("publishes a brand-new kit too", async () => {
    const { repo, saved } = stubRepo(null);
    const svc = new CreatorMediaKitService(repo);
    await svc.upsert("u1", { headline: "Beauty Creator" });
    expect(saved[0].is_published).toBe(true);
  });

  it("stores a cleared text field as null, not an empty string", async () => {
    const { repo, saved } = stubRepo({ user_id: "u1", headline: "Old" });
    const svc = new CreatorMediaKitService(repo);
    await svc.upsert("u1", { headline: "   " });
    expect(saved[0].headline).toBeNull();
  });
});

describe("CreatorMediaKitService.upsert — normalisation", () => {
  it("drops half-filled stat rows and trims the rest", async () => {
    const { repo, saved } = stubRepo(null);
    const svc = new CreatorMediaKitService(repo);
    await svc.upsert("u1", {
      stats: [
        { label: "  Followers  ", value: " 68K+ " },
        { label: "Reach", value: "" },
        { label: "", value: "5.6%" },
      ],
    });
    expect(saved[0].stats).toEqual([{ label: "Followers", value: "68K+" }]);
  });

  it("caps stats at 4 and content types at 8", async () => {
    const { repo, saved } = stubRepo(null);
    const svc = new CreatorMediaKitService(repo);
    await svc.upsert("u1", {
      stats: Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: `${i}` })),
      content_types: Array.from({ length: 12 }, (_, i) => `C${i}`),
    });
    expect(saved[0].stats).toHaveLength(4);
    expect(saved[0].content_types).toHaveLength(8);
  });

  it("clamps a segment percentage into 0-100 rather than rejecting the save", async () => {
    const { repo, saved } = stubRepo(null);
    const svc = new CreatorMediaKitService(repo);
    await svc.upsert("u1", {
      audience: [
        { label: "Women 18-24", percent: 140 },
        { label: "Men", percent: -3 },
      ],
    });
    expect(saved[0].audience).toEqual([
      { label: "Women 18-24", percent: 100 },
      { label: "Men", percent: 0 },
    ]);
  });

  it("caps audience and locations at 6 segments each", async () => {
    const { repo, saved } = stubRepo(null);
    const svc = new CreatorMediaKitService(repo);
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `S${i}`, percent: 10 }));
    await svc.upsert("u1", { audience: many, top_locations: many });
    expect(saved[0].audience).toHaveLength(6);
    expect(saved[0].top_locations).toHaveLength(6);
  });
});
