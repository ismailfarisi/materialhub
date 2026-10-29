import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AppDataSource, CreatorApplicationStatus, CreatorTier } from "@materialhub/database";
import type { MediaService } from "@materialhub/utils";
import { CreatorApplicationService } from "./creator-application.service.ts";

const baseDto = {
  display_name: "Aisha Glow",
  bio: "Skincare tips",
  primary_category: "Skincare",
  social_links: { instagram: "@aishaglow" },
  follower_estimate: 1200,
  sample_urls: ["https://example.com/reel/1"],
  motivation: "I love it",
  agreed_to_terms: true,
};

function makeService(
  overrides: {
    user?: any;
    openApp?: any;
  } = {},
) {
  const saved: any[] = [];
  const appRepo = {
    findOne: mock(async () => overrides.openApp ?? null),
    create: (x: any) => ({ id: "app-1", ...x }),
    save: mock(async (x: any) => {
      saved.push(x);
      return x;
    }),
  };
  const userRepo = {
    findOne: mock(async () =>
      overrides.user === undefined
        ? { id: "u1", creator_tier: CreatorTier.regular }
        : overrides.user,
    ),
  };
  const svc = new CreatorApplicationService(appRepo as any, userRepo as any);
  return { svc, appRepo, userRepo, saved };
}

describe("CreatorApplicationService.apply", () => {
  it("inserts a pending application for a regular user", async () => {
    const { svc, saved } = makeService();
    const app = await svc.apply("u1", baseDto);
    expect(app.status).toBe(CreatorApplicationStatus.pending);
    expect(app.user_id).toBe("u1");
    expect(saved.length).toBe(1);
  });

  it("rejects when the user already has an open application", async () => {
    const { svc } = makeService({ openApp: { id: "existing", status: "pending" } });
    await expect(svc.apply("u1", baseDto)).rejects.toThrow("application_open");
  });

  it("rejects when the user is already a creator", async () => {
    const { svc } = makeService({ user: { id: "u1", creator_tier: CreatorTier.creator } });
    await expect(svc.apply("u1", baseDto)).rejects.toThrow("already_creator");
  });

  it("rejects when terms are not accepted", async () => {
    const { svc } = makeService();
    await expect(svc.apply("u1", { ...baseDto, agreed_to_terms: false })).rejects.toThrow(
      "terms_not_accepted",
    );
  });
});

describe("CreatorApplicationService review actions", () => {
  const stubTransaction = () => {
    const original = (AppDataSource as any).transaction;
    (AppDataSource as any).transaction = async (fn: any) => fn({} as any);
    return () => {
      (AppDataSource as any).transaction = original;
    };
  };

  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = stubTransaction();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  function reviewService(appStatus: CreatorApplicationStatus) {
    const svc = new CreatorApplicationService({} as any, {} as any);
    const calls = { promoted: [] as string[], finalized: [] as any[], audits: [] as string[] };
    (svc as any).loadReviewable = async () => ({
      id: "app-1",
      user_id: "u1",
      status: appStatus,
    });
    (svc as any).promoteUser = async (_m: any, userId: string) => {
      calls.promoted.push(userId);
    };
    (svc as any).finalize = async (_m: any, app: any, status: any, adminId: string, notes: any) => {
      calls.finalized.push({ status, adminId, notes });
      return { ...app, status, reviewed_by: adminId, review_notes: notes };
    };
    (svc as any).writeAudit = async (_m: any, _admin: string, _role: string, action: string) => {
      calls.audits.push(action);
    };
    return { svc, calls };
  }

  it("approve promotes the user (only path that calls promoteUser)", async () => {
    const { svc, calls } = reviewService(CreatorApplicationStatus.pending);
    const app = await svc.approve("app-1", "admin-1", "admin");
    expect(app.status).toBe(CreatorApplicationStatus.approved);
    expect(calls.promoted).toEqual(["u1"]);
    expect(calls.finalized[0].status).toBe(CreatorApplicationStatus.approved);
    expect(calls.audits).toEqual(["creator_application_approved"]);
  });

  it("reject sets status + notes and leaves tier untouched", async () => {
    const { svc, calls } = reviewService(CreatorApplicationStatus.pending);
    const app = await svc.reject("app-1", "admin-1", "admin", "not enough reach");
    expect(app.status).toBe(CreatorApplicationStatus.rejected);
    expect(app.review_notes).toBe("not enough reach");
    expect(calls.promoted).toEqual([]); // NO promotion
    expect(calls.audits).toEqual(["creator_application_rejected"]);
  });

  it("requestInfo sets needs_info + notes and leaves tier untouched", async () => {
    const { svc, calls } = reviewService(CreatorApplicationStatus.pending);
    const app = await svc.requestInfo("app-1", "admin-1", "admin", "add tiktok");
    expect(app.status).toBe(CreatorApplicationStatus.needs_info);
    expect(calls.promoted).toEqual([]); // NO promotion
    expect(calls.audits).toEqual(["creator_application_needs_info"]);
  });

  it("throws application_not_reviewable when already approved", async () => {
    const svc = new CreatorApplicationService({} as any, {} as any);
    // Use the real loadReviewable against a stubbed manager repo.
    const stubMgr = {
      getRepository: () => ({
        findOne: async () => ({
          id: "app-1",
          user_id: "u1",
          status: CreatorApplicationStatus.approved,
        }),
      }),
    };
    await expect((svc as any).loadReviewable(stubMgr, "app-1")).rejects.toThrow(
      "application_not_reviewable",
    );
  });

  // ── race-safety: the crux of the conditional-UPDATE promote guarantee ───
  //
  // approve() awaits promoteUser() but never inspects its result. This is
  // intentional: promoteUser's UPDATE is a conditional no-op when the user
  // was already promoted by a concurrent path (e.g. the DB graduation
  // trigger, or a second admin racing the same approval). approve() must
  // still succeed end-to-end in that case, and the promote write itself
  // must never touch anything beyond creator_tier / creator_tier_earned_at
  // (in particular, no trust-flag columns).
  it("approve still succeeds when the conditional promote UPDATE affects 0 rows (already promoted)", async () => {
    const svc = new CreatorApplicationService({} as any, {} as any);
    const calls = { finalized: [] as any[], audits: [] as string[], queries: [] as any[] };
    (svc as any).loadReviewable = async () => ({
      id: "app-1",
      user_id: "u1",
      status: CreatorApplicationStatus.pending,
    });
    (svc as any).finalize = async (_m: any, app: any, status: any, adminId: string, notes: any) => {
      calls.finalized.push({ status, adminId, notes });
      return { ...app, status, reviewed_by: adminId, review_notes: notes };
    };
    (svc as any).writeAudit = async (_m: any, _admin: string, _role: string, action: string) => {
      calls.audits.push(action);
    };

    // Exercise the REAL promoteUser seam (not stubbed) against a manager
    // whose query() simulates the pg driver's response to an UPDATE that
    // matched zero rows: an empty result array. No throw is raised by the
    // driver or by promoteUser in that case.
    const manager = {
      query: mock(async (sql: string, params: any[]) => {
        calls.queries.push({ sql, params });
        return [];
      }),
    };
    (AppDataSource as any).transaction = async (fn: any) => fn(manager as any);

    const app = await svc.approve("app-1", "admin-1", "admin");

    expect(app.status).toBe(CreatorApplicationStatus.approved);
    expect(calls.finalized[0].status).toBe(CreatorApplicationStatus.approved);
    expect(calls.audits).toEqual(["creator_application_approved"]);

    // The promote write ran exactly once, and only sets creator_tier /
    // creator_tier_earned_at — no trust-flag column is touched.
    expect(calls.queries.length).toBe(1);
    const promoteSql = calls.queries[0].sql as string;
    expect(promoteSql).toContain("\"creator_tier\" = 'creator'");
    expect(promoteSql).toContain('"creator_tier_earned_at" = now()');
    expect(promoteSql.toLowerCase()).not.toContain("trust");
    expect(calls.queries[0].params).toEqual(["u1"]);
  });
});

function makeServiceWithApp(app: any, media?: Partial<MediaService>) {
  const saved: any[] = [];
  const updated: any[] = [];
  const appRepo = {
    findOne: mock(async () => app),
    save: mock(async (x: any) => {
      saved.push(x);
      return x;
    }),
  };
  const userRepo = {
    update: mock(async (criteria: any, partial: any) => {
      updated.push({ criteria, partial });
    }),
  };
  const svc = new CreatorApplicationService(appRepo as any, userRepo as any, media as MediaService);
  return { svc, appRepo, userRepo, saved, updated };
}

describe("CreatorApplicationService.updateProfile", () => {
  it("updates only the fields provided", async () => {
    const app = {
      id: "app-1",
      user_id: "u1",
      display_name: "Old Name",
      bio: "Old bio",
      social_links: { instagram: "@old" },
    };
    const { svc, saved } = makeServiceWithApp(app);
    const result = await svc.updateProfile("u1", { display_name: "New Name" });
    expect(result.display_name).toBe("New Name");
    expect(result.bio).toBe("Old bio");
    expect(result.social_links).toEqual({ instagram: "@old" });
    expect(saved).toHaveLength(1);
  });

  it("replaces social_links wholesale when provided", async () => {
    const app = {
      id: "app-1",
      user_id: "u1",
      display_name: "Name",
      bio: "Bio",
      social_links: { instagram: "@old", tiktok: "@old" },
    };
    const { svc } = makeServiceWithApp(app);
    const result = await svc.updateProfile("u1", {
      social_links: { instagram: "@new" },
    });
    expect(result.social_links).toEqual({ instagram: "@new" });
  });

  it("throws when the caller has no application row", async () => {
    const { svc } = makeServiceWithApp(null);
    await expect(svc.updateProfile("u1", { bio: "x" })).rejects.toThrow("application_not_found");
  });
});

describe("CreatorApplicationService avatar methods", () => {
  it("presignAvatar delegates to MediaService with the caller's userId", async () => {
    const generatePresignedUrlForAsset = mock(async () => ({
      uploadUrl: "https://s3/put",
      key: "users/u1/avatar/abc/me.jpg",
      expiresAt: new Date(),
    }));
    const { svc } = makeServiceWithApp(null, { generatePresignedUrlForAsset } as any);
    const result = await svc.presignAvatar("u1", "me.jpg", "image/jpeg");
    expect(result).toEqual({
      uploadUrl: "https://s3/put",
      key: "users/u1/avatar/abc/me.jpg",
    });
    expect(generatePresignedUrlForAsset).toHaveBeenCalledWith({
      assetType: "user_avatar",
      filename: "me.jpg",
      contentType: "image/jpeg",
      userId: "u1",
    });
  });

  it("finalizeAvatar processes the image and writes User.avatar_url", async () => {
    const processAssetImage = mock(async () => ({
      url: "https://cdn/users/u1/avatar/abc/me.webp",
    }));
    const { svc, updated } = makeServiceWithApp(null, { processAssetImage } as any);
    const url = await svc.finalizeAvatar("u1", "users/u1/avatar/abc/me.jpg");
    expect(url).toBe("https://cdn/users/u1/avatar/abc/me.webp");
    expect(updated).toHaveLength(1);
    expect(updated[0].criteria).toEqual({ id: "u1" });
    expect(updated[0].partial).toEqual({ avatar_url: url });
    expect(processAssetImage).toHaveBeenCalledWith({
      assetType: "user_avatar",
      key: "users/u1/avatar/abc/me.jpg",
    });
  });

  it("finalizeAvatar rejects a key outside the caller's own avatar prefix", async () => {
    const { svc } = makeServiceWithApp(null);
    await expect(svc.finalizeAvatar("u1", "users/someone-else/avatar/abc/me.jpg")).rejects.toThrow(
      "invalid_avatar_key",
    );
  });
});
