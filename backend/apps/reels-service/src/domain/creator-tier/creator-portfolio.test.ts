import { describe, expect, it, mock } from "bun:test";
import { type MediaService, buildAssetKey } from "@materialhub/utils";
import { CreatorPortfolioService } from "./creator-portfolio.service.ts";

function makeService(seed: { rows?: any[] } = {}, media?: Partial<MediaService>) {
  const rows: any[] = seed.rows ?? [];
  const saved: any[] = [];
  const removed: any[] = [];
  let idSeq = 0;
  const repo = {
    find: mock(async ({ where }: any) =>
      rows.filter(
        (r) =>
          r.user_id === where.user_id &&
          (where.kind === undefined || r.kind === where.kind) &&
          !r.deleted_at,
      ),
    ),
    findOne: mock(async ({ where }: any) => {
      const match = rows.find(
        (r) =>
          (where.id === undefined || r.id === where.id) &&
          (where.user_id === undefined || r.user_id === where.user_id) &&
          (where.kind === undefined || r.kind === where.kind) &&
          !r.deleted_at,
      );
      return match ?? null;
    }),
    create: (x: any) => ({ id: `pv-${++idSeq}`, deleted_at: null, ...x }),
    save: mock(async (x: any) => {
      rows.push(x);
      saved.push(x);
      return x;
    }),
    softRemove: mock(async (x: any) => {
      x.deleted_at = new Date();
      removed.push(x);
      return x;
    }),
  };
  const svc = new CreatorPortfolioService(repo as any, media as MediaService);
  return { svc, repo, rows, saved, removed };
}

describe("CreatorPortfolioService.presignVideo", () => {
  it("delegates to MediaService with the caller's userId and the portfolio asset type", async () => {
    const generatePresignedUrlForAsset = mock(async () => ({
      uploadUrl: "https://s3/put",
      key: "users/u1/portfolio/abc/clip.mp4",
      expiresAt: new Date(),
    }));
    const { svc } = makeService({}, { generatePresignedUrlForAsset } as any);
    const result = await svc.presignVideo("u1", "clip.mp4", "video/mp4");
    expect(result).toEqual({ uploadUrl: "https://s3/put", key: "users/u1/portfolio/abc/clip.mp4" });
    expect(generatePresignedUrlForAsset).toHaveBeenCalledWith({
      assetType: "creator_portfolio_video",
      filename: "clip.mp4",
      contentType: "video/mp4",
      userId: "u1",
    });
  });
});

describe("CreatorPortfolioService.finalizeVideo", () => {
  it("rejects a key outside the caller's own portfolio prefix", async () => {
    const { svc } = makeService();
    await expect(
      svc.finalizeVideo("u1", "users/someone-else/portfolio/abc/clip.mp4", "sample"),
    ).rejects.toThrow("invalid_portfolio_key");
  });

  it("creates a sample row with the given caption", async () => {
    const processAssetImage = mock(async () => ({ url: "https://cdn/clip.mp4" }));
    const { svc, saved } = makeService({}, { processAssetImage } as any);
    const row = await svc.finalizeVideo(
      "u1",
      "users/u1/portfolio/abc/clip.mp4",
      "sample",
      "Behind the scenes",
    );
    expect(row.kind).toBe("sample");
    expect(row.video_url).toBe("https://cdn/clip.mp4");
    expect(row.caption).toBe("Behind the scenes");
    expect(saved).toHaveLength(1);
    expect(processAssetImage).toHaveBeenCalledWith({
      assetType: "creator_portfolio_video",
      key: "users/u1/portfolio/abc/clip.mp4",
    });
  });

  it("rejects a 7th sample video", async () => {
    const existing = Array.from({ length: 6 }, (_, i) => ({
      id: `pv-${i}`,
      user_id: "u1",
      kind: "sample",
      video_url: `https://cdn/${i}.mp4`,
      content_type: "video/mp4",
      caption: null,
      deleted_at: null,
    }));
    const processAssetImage = mock(async () => ({ url: "https://cdn/new.mp4" }));
    const { svc } = makeService({ rows: existing }, { processAssetImage } as any);
    await expect(
      svc.finalizeVideo("u1", "users/u1/portfolio/abc/new.mp4", "sample"),
    ).rejects.toThrow("portfolio_sample_limit_reached");
  });

  it("accepts a key actually produced by buildAssetKey for this asset type (keyPrefix/service prefix-check agreement)", async () => {
    const processAssetImage = mock(async () => ({ url: "https://cdn/clip.mp4" }));
    const { svc } = makeService({}, { processAssetImage } as any);
    const key = buildAssetKey("creator_portfolio_video", "clip.mp4", { userId: "u1" });
    const row = await svc.finalizeVideo("u1", key, "sample");
    expect(row.video_url).toBe("https://cdn/clip.mp4");
  });

  it("replaces an existing intro video: deletes the old S3 object and soft-removes the old row", async () => {
    const oldIntro = {
      id: "pv-old",
      user_id: "u1",
      kind: "intro",
      video_url: "https://cdn/old-intro.mp4",
      content_type: "video/mp4",
      caption: null,
      deleted_at: null,
    };
    const processAssetImage = mock(async () => ({ url: "https://cdn/new-intro.mp4" }));
    const deleteMedia = mock(async () => {});
    const extractKeyFromPublicUrl = mock((url: string) => url.replace("https://cdn/", ""));
    const { svc, saved, removed } = makeService({ rows: [oldIntro] }, {
      processAssetImage,
      deleteMedia,
      extractKeyFromPublicUrl,
    } as any);
    const row = await svc.finalizeVideo("u1", "users/u1/portfolio/abc/new-intro.mp4", "intro");
    expect(row.video_url).toBe("https://cdn/new-intro.mp4");
    expect(removed).toHaveLength(1);
    expect(removed[0].id).toBe("pv-old");
    expect(deleteMedia).toHaveBeenCalledWith(["old-intro.mp4"]);
    expect(saved).toHaveLength(1);
  });
});

describe("CreatorPortfolioService.listVideos", () => {
  it("separates intro from samples", async () => {
    const rows = [
      {
        id: "pv-1",
        user_id: "u1",
        kind: "sample",
        video_url: "a",
        content_type: "video/mp4",
        caption: null,
        deleted_at: null,
      },
      {
        id: "pv-2",
        user_id: "u1",
        kind: "intro",
        video_url: "b",
        content_type: "video/mp4",
        caption: null,
        deleted_at: null,
      },
    ];
    const { svc } = makeService({ rows });
    const result = await svc.listVideos("u1");
    expect(result.intro?.id).toBe("pv-2");
    expect(result.samples.map((r) => r.id)).toEqual(["pv-1"]);
  });
});

describe("CreatorPortfolioService.deleteVideo", () => {
  it("deletes the caller's own video and its S3 object", async () => {
    const row = {
      id: "pv-1",
      user_id: "u1",
      kind: "sample",
      video_url: "https://cdn/clip.mp4",
      content_type: "video/mp4",
      caption: null,
      deleted_at: null,
    };
    const deleteMedia = mock(async () => {});
    const extractKeyFromPublicUrl = mock(() => "users/u1/portfolio/abc/clip.mp4");
    const { svc, removed } = makeService({ rows: [row] }, {
      deleteMedia,
      extractKeyFromPublicUrl,
    } as any);
    await svc.deleteVideo("u1", "pv-1");
    expect(removed).toHaveLength(1);
    expect(deleteMedia).toHaveBeenCalledWith(["users/u1/portfolio/abc/clip.mp4"]);
  });

  it("refuses another user's video", async () => {
    const row = {
      id: "pv-1",
      user_id: "someone-else",
      kind: "sample",
      video_url: "https://cdn/clip.mp4",
      content_type: "video/mp4",
      caption: null,
      deleted_at: null,
    };
    const { svc } = makeService({ rows: [row] });
    await expect(svc.deleteVideo("u1", "pv-1")).rejects.toThrow("not_your_video");
  });

  it("404s a video that does not exist", async () => {
    const { svc } = makeService();
    await expect(svc.deleteVideo("u1", "nonexistent")).rejects.toThrow("video_not_found");
  });
});
