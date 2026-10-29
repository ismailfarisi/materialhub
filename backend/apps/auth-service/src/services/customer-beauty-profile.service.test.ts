import { describe, expect, test } from "bun:test";
import type { CustomerBeautyProfile } from "@materialhub/database";
import { SkinType, Undertone } from "@materialhub/database";
import type { Repository } from "typeorm";
import { CustomerBeautyProfileService } from "./customer-beauty-profile.service.ts";

// ─── In-memory mock repository ───

function makeMockRepo(initial: Partial<CustomerBeautyProfile>[] = []) {
  const store: Partial<CustomerBeautyProfile>[] = [...initial];

  const repo = {
    findOne: async ({ where }: any): Promise<CustomerBeautyProfile | null> => {
      const userId = where?.user_id;
      return (
        (store.find((p) => p.user_id === userId && !p.deleted_at) as CustomerBeautyProfile) ?? null
      );
    },
    save: async (entity: any): Promise<CustomerBeautyProfile> => {
      const existing = store.findIndex((p) => p.id === entity.id);
      if (existing >= 0) {
        store[existing] = { ...store[existing], ...entity };
        return store[existing] as CustomerBeautyProfile;
      }
      const saved = { id: `profile-${store.length + 1}`, ...entity } as CustomerBeautyProfile;
      store.push(saved);
      return saved;
    },
  } as unknown as Repository<CustomerBeautyProfile>;

  return { repo, store };
}

describe("CustomerBeautyProfileService", () => {
  // 1. get() returns null when no profile exists
  test("get() returns null when no profile exists", async () => {
    const { repo } = makeMockRepo();
    const service = new CustomerBeautyProfileService(repo);
    const result = await service.get("user-1");
    expect(result).toBeNull();
  });

  // 2. upsert() creates a new profile with user_id when none exists
  test("upsert() creates a new profile with user_id when none exists", async () => {
    const { repo } = makeMockRepo();
    const service = new CustomerBeautyProfileService(repo);
    const result = await service.upsert("user-1", { skin_type: "oily" });
    expect(result.user_id).toBe("user-1");
    expect(result.skin_type).toBe(SkinType.oily);
  });

  // 3. upsert() merges into existing profile (same id, no duplicate; new field added, old field retained)
  test("upsert() merges into existing profile", async () => {
    const { repo } = makeMockRepo();
    const service = new CustomerBeautyProfileService(repo);

    const first = await service.upsert("user-2", { skin_type: "dry" });
    const firstId = first.id;

    const second = await service.upsert("user-2", { undertone: "cool" });
    expect(second.id).toBe(firstId); // same record, not a duplicate
    expect(second.skin_type).toBe(SkinType.dry); // old field retained
    expect(second.undertone).toBe(Undertone.cool); // new field added
  });

  // 4. upsert() with completed: true stamps completed_at
  test("upsert() with completed: true stamps completed_at", async () => {
    const { repo } = makeMockRepo();
    const service = new CustomerBeautyProfileService(repo);
    const result = await service.upsert("user-3", { completed: true });
    expect(result.completed_at).toBeInstanceOf(Date);
  });

  // 5. upsert() without completed does NOT stamp completed_at
  test("upsert() without completed does NOT stamp completed_at", async () => {
    const { repo } = makeMockRepo();
    const service = new CustomerBeautyProfileService(repo);
    const result = await service.upsert("user-4", { skin_type: "normal" });
    expect(result.completed_at == null).toBe(true);
  });

  // 6. isCompleted() returns false when no profile / no completed_at, true when completed_at present
  test("isCompleted() returns false when no profile exists", async () => {
    const { repo } = makeMockRepo();
    const service = new CustomerBeautyProfileService(repo);
    expect(await service.isCompleted("user-999")).toBe(false);
  });

  test("isCompleted() returns false when profile exists but completed_at is null", async () => {
    const { repo } = makeMockRepo();
    const service = new CustomerBeautyProfileService(repo);
    await service.upsert("user-5", { skin_type: "sensitive" });
    expect(await service.isCompleted("user-5")).toBe(false);
  });

  test("isCompleted() returns true when completed_at is present", async () => {
    const { repo } = makeMockRepo();
    const service = new CustomerBeautyProfileService(repo);
    await service.upsert("user-6", { completed: true });
    expect(await service.isCompleted("user-6")).toBe(true);
  });
});
