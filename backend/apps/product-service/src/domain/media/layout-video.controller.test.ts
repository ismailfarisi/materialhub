import { describe, expect, test } from "bun:test";
import type { AuthUser } from "@materialhub/guards";
import { LayoutVideoController } from "./layout-video.controller.ts";

const ADMIN = { id: "u-admin", role: "admin" } as unknown as AuthUser;
const VENDOR = { id: "u-vendor", role: "vendor" } as unknown as AuthUser;

class FakeRepo {
  rows: Record<string, any> = {};
  counts: Record<string, number> = {};
  softRemoved: string[] = [];
  async countLayoutVideosByVendor(vendorId: string) {
    return this.counts[vendorId] ?? 0;
  }
  async findLayoutVideoById(id: string) {
    return this.rows[id] ?? null;
  }
  async create(data: any) {
    const row = { id: "v-new", ...data };
    this.rows[row.id] = row;
    return row;
  }
  async softRemove(id: string) {
    this.softRemoved.push(id);
  }
}
class FakeLookup {
  vendorId: string | null = "vend-1";
  async findVendorIdByUserId() {
    return this.vendorId;
  }
}
class FakeMedia {
  async generateLayoutVideoPresignedUrl(input: any) {
    return {
      url: "https://s3/put",
      key: `raw-video/layout/${input.vendorId ?? "platform"}/x.mp4`,
      expiresIn: 900,
    };
  }
}
class FakeQueue {
  jobs: any[] = [];
  async add(name: string, data: unknown) {
    this.jobs.push({ name, data });
  }
}

function build() {
  const repo = new FakeRepo();
  const lookup = new FakeLookup();
  const media = new FakeMedia();
  const queue = new FakeQueue();
  const ctrl = new LayoutVideoController(repo as any, lookup as any, media as any, queue as any);
  return { ctrl, repo, lookup, media, queue };
}

describe("LayoutVideoController.presign", () => {
  test("rejects a disallowed content type", async () => {
    const { ctrl } = build();
    await expect(
      ctrl.presign(
        "admin",
        { filename: "a.mov", content_type: "video/quicktime", size_bytes: 1000 },
        ADMIN,
      ),
    ).rejects.toThrow(/MP4 and WebM/);
  });

  test("rejects a file over 25MB", async () => {
    const { ctrl } = build();
    await expect(
      ctrl.presign(
        "admin",
        { filename: "a.mp4", content_type: "video/mp4", size_bytes: 26 * 1024 * 1024 },
        ADMIN,
      ),
    ).rejects.toThrow(/25MB/);
  });

  test("rejects a customer", async () => {
    const { ctrl } = build();
    await expect(
      ctrl.presign(
        "customer",
        { filename: "a.mp4", content_type: "video/mp4", size_bytes: 10 },
        ADMIN,
      ),
    ).rejects.toThrow(/permissions/i);
  });

  test("admin presign is not vendor-scoped", async () => {
    const { ctrl } = build();
    const res = await ctrl.presign(
      "admin",
      { filename: "a.mp4", content_type: "video/mp4", size_bytes: 10 },
      ADMIN,
    );
    expect(res.key).toContain("/layout/platform/");
  });

  test("vendor presign is scoped to their vendor", async () => {
    const { ctrl } = build();
    const res = await ctrl.presign(
      "vendor",
      { filename: "a.mp4", content_type: "video/mp4", size_bytes: 10 },
      VENDOR,
    );
    expect(res.key).toContain("/layout/vend-1/");
  });

  test("rejects the 11th vendor video", async () => {
    const { ctrl, repo } = build();
    repo.counts["vend-1"] = 10;
    await expect(
      ctrl.presign(
        "vendor",
        { filename: "a.mp4", content_type: "video/mp4", size_bytes: 10 },
        VENDOR,
      ),
    ).rejects.toThrow(/limit of 10/);
  });

  test("rejects a vendor with no membership", async () => {
    const { ctrl, lookup } = build();
    lookup.vendorId = null;
    await expect(
      ctrl.presign(
        "vendor",
        { filename: "a.mp4", content_type: "video/mp4", size_bytes: 10 },
        VENDOR,
      ),
    ).rejects.toThrow(/No vendor record/);
  });
});

describe("LayoutVideoController.process", () => {
  test("creates a layout row with a null product_id and enqueues", async () => {
    const { ctrl, repo, queue } = build();
    const res = await ctrl.process("vendor", { key: "raw-video/layout/vend-1/x.mp4" }, VENDOR);
    const row = repo.rows[res.video.id];
    expect(row.asset_type).toBe("layout_background");
    expect(row.product_id).toBeNull();
    expect(row.vendor_id).toBe("vend-1");
    expect(row.status).toBe("processing");
    expect(queue.jobs[0].data).toMatchObject({
      product_video_id: res.video.id,
      raw_key: "raw-video/layout/vend-1/x.mp4",
      strip_audio: true,
      max_duration_seconds: 15,
    });
  });

  test("refuses a key outside the layout prefix", async () => {
    const { ctrl } = build();
    await expect(
      ctrl.process("vendor", { key: "raw-video/vend-1/prod-1/x.mp4" }, VENDOR),
    ).rejects.toThrow(/key/i);
  });

  test("refuses a key scoped to another vendor", async () => {
    const { ctrl } = build();
    await expect(
      ctrl.process("vendor", { key: "raw-video/layout/vend-2/x.mp4" }, VENDOR),
    ).rejects.toThrow(/not own/i);
  });

  test("refuses a platform-scoped key for a vendor", async () => {
    const { ctrl } = build();
    await expect(
      ctrl.process("vendor", { key: "raw-video/layout/platform/x.mp4" }, VENDOR),
    ).rejects.toThrow(/not own/i);
  });

  // The quota is enforced here and not only at presign: one presigned key can
  // be replayed at process N times, and process is what mints the row and the
  // ffmpeg job on a concurrency-2 queue.
  test("refuses a vendor already at quota, even with a valid presigned key", async () => {
    const { ctrl, repo, queue } = build();
    repo.counts["vend-1"] = 10;
    await expect(
      ctrl.process("vendor", { key: "raw-video/layout/vend-1/x.mp4" }, VENDOR),
    ).rejects.toThrow(/limit of 10/);
    expect(Object.keys(repo.rows)).toHaveLength(0);
    expect(queue.jobs).toHaveLength(0);
  });

  test("replaying one presigned key cannot exceed the quota", async () => {
    const { ctrl, repo, queue } = build();
    repo.counts["vend-1"] = 9;
    const key = "raw-video/layout/vend-1/x.mp4";

    await ctrl.process("vendor", { key }, VENDOR);
    // The first call consumed the tenth slot.
    repo.counts["vend-1"] = 10;
    await expect(ctrl.process("vendor", { key }, VENDOR)).rejects.toThrow(/limit of 10/);

    expect(queue.jobs).toHaveLength(1);
  });

  test("admins are not quota-limited", async () => {
    const { ctrl, queue } = build();
    await ctrl.process("admin", { key: "raw-video/layout/platform/x.mp4" }, ADMIN);
    expect(queue.jobs).toHaveLength(1);
  });
});

describe("LayoutVideoController.get", () => {
  test("returns a vendor's own row", async () => {
    const { ctrl, repo } = build();
    repo.rows.v1 = {
      id: "v1",
      vendor_id: "vend-1",
      status: "ready",
      url: "u",
      poster_url: "p",
      duration_seconds: 9,
    };
    const res = await ctrl.get("vendor", "v1", VENDOR);
    expect(res.status).toBe("ready");
  });

  test("refuses another vendor's row", async () => {
    const { ctrl, repo } = build();
    repo.rows.v1 = {
      id: "v1",
      vendor_id: "vend-2",
      status: "ready",
      url: "u",
      poster_url: "p",
      duration_seconds: 9,
    };
    await expect(ctrl.get("vendor", "v1", VENDOR)).rejects.toThrow(/not own/i);
  });

  test("refuses a platform row for a vendor", async () => {
    const { ctrl, repo } = build();
    repo.rows.v1 = {
      id: "v1",
      vendor_id: null,
      status: "ready",
      url: "u",
      poster_url: "p",
      duration_seconds: 9,
    };
    await expect(ctrl.get("vendor", "v1", VENDOR)).rejects.toThrow(/not own/i);
  });

  test("404s on a product video id", async () => {
    const { ctrl } = build();
    await expect(ctrl.get("admin", "missing", ADMIN)).rejects.toThrow(/not found/i);
  });
});

describe("LayoutVideoController.remove", () => {
  test("soft-removes a vendor's own row", async () => {
    const { ctrl, repo } = build();
    repo.rows.v1 = { id: "v1", vendor_id: "vend-1" };
    await ctrl.remove("vendor", "v1", VENDOR);
    expect(repo.softRemoved).toEqual(["v1"]);
  });

  test("refuses another vendor's row", async () => {
    const { ctrl, repo } = build();
    repo.rows.v1 = { id: "v1", vendor_id: "vend-2" };
    await expect(ctrl.remove("vendor", "v1", VENDOR)).rejects.toThrow(/not own/i);
    expect(repo.softRemoved).toEqual([]);
  });
});
