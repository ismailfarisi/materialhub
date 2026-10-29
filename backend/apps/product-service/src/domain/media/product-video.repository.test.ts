/**
 * Guards the layout-video quota accounting.
 *
 * Root cause guarded here: `countLayoutVideosByVendor` originally counted every
 * non-deleted `layout_background` row regardless of status. A failed transcode
 * is never surfaced to the merchant — `VideoField` drops the id when the poll
 * reports `failed`, and there is no listing UI — so each failure permanently
 * burned one of the vendor's ten slots. Ten failures locked them out for good.
 *
 * Unit-only (no Postgres in CI): the injected TypeORM repository is patched and
 * the `where` clause it receives is asserted directly.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AppDataSource } from "@materialhub/database";
import { Not } from "typeorm";
import { ProductVideoRepository } from "./product-video.repository.ts";

const VENDOR_ID = "11111111-1111-4111-8111-111111111111";

describe("ProductVideoRepository — layout video queries", () => {
  // biome-ignore lint/suspicious/noExplicitAny: capture for restore
  let originalGetRepository: any;
  let countCalls: Array<{ where?: Record<string, unknown> }>;
  let findOneCalls: Array<{ where?: Record<string, unknown> }>;

  beforeEach(() => {
    countCalls = [];
    findOneCalls = [];
    // biome-ignore lint/suspicious/noExplicitAny: deliberate patch for test
    originalGetRepository = (AppDataSource as any).getRepository;
    const fakeRepo = {
      count: mock(async (opts: { where?: Record<string, unknown> }) => {
        countCalls.push(opts);
        return 3;
      }),
      findOne: mock(async (opts: { where?: Record<string, unknown> }) => {
        findOneCalls.push(opts);
        return null;
      }),
    };
    // biome-ignore lint/suspicious/noExplicitAny: deliberate patch for test
    (AppDataSource as any).getRepository = () => fakeRepo;
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: restore the patch
    (AppDataSource as any).getRepository = originalGetRepository;
  });

  it("excludes failed transcodes from the vendor quota count", async () => {
    const repo = new ProductVideoRepository();
    const used = await repo.countLayoutVideosByVendor(VENDOR_ID);

    expect(used).toBe(3);
    expect(countCalls).toHaveLength(1);
    const where = countCalls[0]?.where as Record<string, unknown>;
    expect(where.vendor_id).toBe(VENDOR_ID);
    expect(where.asset_type).toBe("layout_background");
    // A FindOperator, not a bare string: `Not("failed")`.
    expect(where.status).toEqual(Not("failed"));
  });

  it("scopes findLayoutVideoById to layout_background so product rows stay invisible", async () => {
    const repo = new ProductVideoRepository();
    await repo.findLayoutVideoById("some-id");

    expect(findOneCalls).toHaveLength(1);
    expect(findOneCalls[0]?.where).toEqual({
      id: "some-id",
      asset_type: "layout_background",
    });
  });
});
