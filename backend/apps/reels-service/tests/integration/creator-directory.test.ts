import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  CreatorApplication,
  CreatorApplicationStatus,
  CreatorPortfolioVideo,
  CreatorTier,
  User,
  UserRole,
  UserStatus,
  ensureDatabase,
} from "@materialhub/database";
import { CreatorDirectoryService } from "../../src/domain/creator-tier/creator-directory.service.ts";

/**
 * The only test that actually executes the directory SQL. The unit tests in
 * src/domain/creator-tier/creator-directory.test.ts assert the generated SQL
 * text and cannot catch a mistyped column, a broken LATERAL correlation, or a
 * syntax error — this can.
 *
 * Run with:
 *   REELS_LIVE_DB=1 bun test apps/reels-service/tests/integration/creator-directory
 *
 * Gated by REELS_LIVE_DB=1 so it doesn't fail in environments without a DB.
 */
const LIVE_DB = process.env.REELS_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;
// Unique suffix per run so reruns don't collide with leftover rows.
const unique = Date.now();

// Seeded IDs, populated in seed() and used for FK-safe teardown.
let creatorAId = "";
let creatorBId = "";
let regularUserId = "";
let pendingCreatorId = "";
const userIds: string[] = [];

const service = new CreatorDirectoryService();

/**
 * Four users that between them exercise every branch of the WHERE clause:
 *   A — approved creator, "Skincare", 1 intro + 2 samples, graduated most recently
 *   B — approved creator, "Makeup", no portfolio videos, graduated earlier
 *   C — regular tier WITH an approved application (must not appear)
 *   D — creator tier whose only application is pending (must not appear)
 */
async function seed() {
  const userRepo = AppDataSource.getRepository(User);
  const appRepo = AppDataSource.getRepository(CreatorApplication);
  const videoRepo = AppDataSource.getRepository(CreatorPortfolioVideo);

  const mkUser = async (tag: string, tier: CreatorTier, earnedAt: Date | null) => {
    const u = await userRepo.save(
      userRepo.create({
        first_name: tag,
        last_name: "dir",
        email: `dir-${tag}-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
        avatar_url: tier === CreatorTier.regular ? null : `https://cdn/${tag}-${unique}.webp`,
        creator_tier: tier,
        creator_tier_earned_at: earnedAt,
      }),
    );
    userIds.push(u.id);
    return u.id;
  };

  const mkApplication = (
    userId: string,
    status: CreatorApplicationStatus,
    displayName: string,
    bio: string,
    category: string,
  ) =>
    appRepo.save(
      appRepo.create({
        user_id: userId,
        status,
        display_name: displayName,
        bio,
        primary_category: category,
        social_links: {},
        agreed_to_terms_at: new Date(),
        reviewed_at: status === CreatorApplicationStatus.approved ? new Date() : null,
      }),
    );

  const mkVideo = (userId: string, kind: "intro" | "sample") =>
    videoRepo.save(
      videoRepo.create({
        user_id: userId,
        kind,
        video_url: `https://cdn/${userId}-${kind}-${Math.random()}.mp4`,
        content_type: "video/mp4",
        caption: null,
      }),
    );

  const now = Date.now();
  creatorAId = await mkUser("a", CreatorTier.creator, new Date(now - 60_000));
  creatorBId = await mkUser("b", CreatorTier.creator, new Date(now - 3_600_000));
  regularUserId = await mkUser("c", CreatorTier.regular, null);
  pendingCreatorId = await mkUser("d", CreatorTier.creator, new Date(now - 120_000));

  await mkApplication(
    creatorAId,
    CreatorApplicationStatus.approved,
    `Aisha Glow ${unique}`,
    `Skincare tips ${unique}`,
    "Skincare",
  );
  await mkApplication(
    creatorBId,
    CreatorApplicationStatus.approved,
    `Mariam Muse ${unique}`,
    `Bold looks ${unique}`,
    "Makeup",
  );
  await mkApplication(
    regularUserId,
    CreatorApplicationStatus.approved,
    `Regular Rita ${unique}`,
    `Not a creator ${unique}`,
    "Skincare",
  );
  await mkApplication(
    pendingCreatorId,
    CreatorApplicationStatus.pending,
    `Pending Pia ${unique}`,
    `Still waiting ${unique}`,
    "Skincare",
  );

  await mkVideo(creatorAId, "intro");
  await mkVideo(creatorAId, "sample");
  await mkVideo(creatorAId, "sample");
}

async function cleanup() {
  if (userIds.length === 0) return;
  // Videos → applications → users, so no FK is left dangling.
  await AppDataSource.query(
    "DELETE FROM creator_portfolio_videos WHERE user_id = ANY($1::uuid[])",
    [userIds],
  );
  await AppDataSource.query("DELETE FROM creator_applications WHERE user_id = ANY($1::uuid[])", [
    userIds,
  ]);
  await AppDataSource.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);
}

/** Only the rows this run seeded — the table may hold other creators. */
function seeded(items: Array<{ id: string }>) {
  return items.filter((i) => userIds.includes(i.id));
}

describeLive("CreatorDirectoryService against a live database", () => {
  beforeAll(async () => {
    await ensureDatabase();
    await seed();
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
    }
  });

  it("lists approved creators only, most recently graduated first", async () => {
    const { items } = await service.list({ limit: 60 });
    const mine = seeded(items);
    expect(mine.map((c) => c.id)).toEqual([creatorAId, creatorBId]);
    expect(mine.some((c) => c.id === regularUserId)).toBe(false);
    expect(mine.some((c) => c.id === pendingCreatorId)).toBe(false);
  });

  it("projects identity from the approved application and media from the portfolio", async () => {
    const { items } = await service.list({ limit: 60 });
    const a = seeded(items).find((c) => c.id === creatorAId);
    expect(a).toBeDefined();
    expect(a?.display_name).toBe(`Aisha Glow ${unique}`);
    expect(a?.primary_category).toBe("Skincare");
    expect(a?.avatar_url).toBe(`https://cdn/a-${unique}.webp`);
    expect(a?.intro_video_url).toContain("-intro-");
    expect(a?.sample_count).toBe(2);
  });

  it("returns null media and a zero count for a creator with no videos", async () => {
    const { items } = await service.list({ limit: 60 });
    const b = seeded(items).find((c) => c.id === creatorBId);
    expect(b?.intro_video_url).toBeNull();
    expect(b?.sample_count).toBe(0);
  });

  it("searches display_name case-insensitively", async () => {
    const { items } = await service.list({ search: `aisha glow ${unique}`, limit: 60 });
    expect(seeded(items).map((c) => c.id)).toEqual([creatorAId]);
  });

  it("searches bio", async () => {
    const { items } = await service.list({ search: `Bold looks ${unique}`, limit: 60 });
    expect(seeded(items).map((c) => c.id)).toEqual([creatorBId]);
  });

  it("treats an underscore in the search term as a literal, not a wildcard", async () => {
    // "Aisha_Glow" must NOT match "Aisha Glow" — proves the ESCAPE clause works
    // in Postgres and not just in the generated string.
    const { items } = await service.list({ search: `Aisha_Glow ${unique}`, limit: 60 });
    expect(seeded(items)).toEqual([]);
  });

  it("filters by exact category", async () => {
    const { items } = await service.list({ category: "Makeup", limit: 60 });
    expect(seeded(items).map((c) => c.id)).toEqual([creatorBId]);
  });

  it("combines search and category", async () => {
    const both = await service.list({ search: unique.toString(), category: "Skincare", limit: 60 });
    expect(seeded(both.items).map((c) => c.id)).toEqual([creatorAId]);
  });

  it("paginates with limit and offset", async () => {
    const page1 = await service.list({ search: unique.toString(), limit: 1 });
    const page2 = await service.list({ search: unique.toString(), limit: 1, offset: 1 });
    expect(page1.items.length).toBe(1);
    expect(page2.items.length).toBe(1);
    expect(page1.items[0]!.id).not.toBe(page2.items[0]!.id);
  });
});
