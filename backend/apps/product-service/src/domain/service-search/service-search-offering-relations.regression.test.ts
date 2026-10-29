/**
 * Regression guard for the CRITICAL defect that made every sync job and
 * reindex batch throw at runtime: `ServiceOffering` has no `vendor` or
 * `category` TypeORM relation (see
 * backend/libs/database/src/entities/service-offering.entity.ts — only raw
 * vendor_id/category_id columns). Asking findOne()/find() for
 * `relations: ["vendor", "category"]` throws EntityPropertyNotFoundError.
 * Refs must be hydrated separately via hydrateOfferingRefs instead.
 */

import { describe, expect, it, mock } from "bun:test";

let capturedFindOneOptions: any;
let capturedFindOptions: any;

mock.module("@materialhub/database", () => ({
  AppDataSource: {
    getRepository: () => ({
      findOne: async (opts: any) => {
        capturedFindOneOptions = opts;
        return null;
      },
      find: async (opts: any) => {
        capturedFindOptions = opts;
        return [];
      },
    }),
    query: async () => [],
  },
  ServiceOffering: class {},
}));

const { defaultDeps: syncDeps } = await import("./service-search-sync.job.ts");
const { defaultDeps: reindexDeps } = await import("./service-search-reindex.service.ts");

describe("regression: no vendor/category relations requested from TypeORM", () => {
  it("service-search-sync.job's loadOffering does not request relations", async () => {
    await syncDeps.loadOffering("o1");
    expect(capturedFindOneOptions).toBeDefined();
    expect(capturedFindOneOptions.relations).toBeUndefined();
  });

  it("service-search-reindex.service's loadPublishedBatch does not request relations", async () => {
    await reindexDeps.loadPublishedBatch(0, 100);
    expect(capturedFindOptions).toBeDefined();
    expect(capturedFindOptions.relations).toBeUndefined();
  });
});
