/**
 * Regression tests for AiSettingsRepository.update().
 *
 * Root cause guarded here: prod `site_settings` has ONLY a PARTIAL unique
 * index on `key` (`... WHERE deleted_at IS NULL`). TypeORM `repo.upsert(x, ["key"])`
 * emits a bare `ON CONFLICT ("key")`, which Postgres refuses to match against a
 * partial index → 500 "there is no unique or exclusion constraint matching the
 * ON CONFLICT specification". The fix targets the partial index via
 * `indexPredicate: "deleted_at IS NULL"`.
 *
 * Two layers:
 *  1. Unit (always runs in CI): spy on the injected repo, assert the upsert is
 *     invoked with the partial-index-aware option object.
 *  2. DB-backed (skips when no Postgres): exercise the real schema end-to-end.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { AppDataSource, SiteSetting, ensureDatabase } from "@materialhub/database";
import { AiSettingsRepository } from "./ai-settings.repository.ts";

const USER_ID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";

describe("AiSettingsRepository.update — partial-index upsert (unit)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: capture for restore
  let originalGetRepository: any;
  let upsertCalls: Array<{ entity: unknown; options: unknown }>;

  beforeEach(() => {
    upsertCalls = [];
    // biome-ignore lint/suspicious/noExplicitAny: deliberate patch for test
    originalGetRepository = (AppDataSource as any).getRepository;
    const fakeRepo = {
      findOne: mock(async () => null),
      upsert: mock(async (entity: unknown, options: unknown) => {
        upsertCalls.push({ entity, options });
        return { identifiers: [], generatedMaps: [], raw: [] };
      }),
    };
    // biome-ignore lint/suspicious/noExplicitAny: deliberate patch for test
    (AppDataSource as any).getRepository = () => fakeRepo;
  });

  it("targets the partial unique index (key WHERE deleted_at IS NULL)", async () => {
    try {
      const repo = new AiSettingsRepository();
      await repo.update({ enabled: true }, USER_ID);

      expect(upsertCalls.length).toBe(1);
      // The second argument MUST be the option object carrying indexPredicate —
      // NOT the bare ["key"] form that fails against a partial index in prod.
      expect(upsertCalls[0]!.options).toEqual({
        conflictPaths: ["key"],
        indexPredicate: "deleted_at IS NULL",
      });
    } finally {
      // biome-ignore lint/suspicious/noExplicitAny: restore original
      (AppDataSource as any).getRepository = originalGetRepository;
    }
  });
});

describe("AiSettingsRepository.update — against real Postgres (skips if unavailable)", () => {
  it("persists enabled flag without an ON CONFLICT error", async () => {
    try {
      await ensureDatabase();
    } catch {
      return; // no DB available — skip
    }
    if (!AppDataSource.isInitialized) return;

    // updated_by is a FK to users: use a real user (skip on an empty DB), and
    // put the setting back afterwards so a local run doesn't change dev data.
    const [user] = await AppDataSource.query("SELECT id FROM users LIMIT 1");
    if (!user) return;
    const settings = AppDataSource.getRepository(SiteSetting);
    const before = await settings.findOne({ where: { key: "ai_image_enhance" } });

    try {
      const repo = new AiSettingsRepository();
      // This call previously threw: "there is no unique or exclusion constraint
      // matching the ON CONFLICT specification" against the partial-index schema.
      const next = await repo.update({ enabled: true, prompt: "test prompt" }, user.id);
      expect(next.enabled).toBe(true);

      const row = await settings.findOne({ where: { key: "ai_image_enhance" } });
      expect(row).not.toBeNull();
      expect((JSON.parse(row!.value) as { enabled: boolean }).enabled).toBe(true);
    } finally {
      if (before) {
        await settings.update(
          { key: "ai_image_enhance" },
          { value: before.value, updated_by: before.updated_by } as any,
        );
      } else {
        await settings.delete({ key: "ai_image_enhance" });
      }
    }
  });
});
