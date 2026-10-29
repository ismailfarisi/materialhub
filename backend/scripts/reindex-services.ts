import { ensureDatabase } from "@materialhub/database";
import { ServiceSearchReindexService } from "../apps/product-service/src/domain/service-search/service-search-reindex.service.ts";
import { ServiceSearchAdapter } from "../apps/product-service/src/domain/service-search/service-search.adapter.ts";

await ensureDatabase();
const adapter = new ServiceSearchAdapter();

// --recreate: the deliberate schema-change path. Drops and recreates the
// Typesense collection (ServiceSearchAdapter#recreateCollection) before
// reindexing — use this only when the collection schema itself changed.
// The nightly reconcile worker NEVER takes this path; it always upserts in
// place so `/services` stays serving throughout the run.
if (process.argv.includes("--recreate")) {
  await adapter.recreateCollection();
}

const service = new ServiceSearchReindexService(adapter);
const { indexed, pruned } = await service.reindexAll();
console.log(
  `Reindexed ${indexed} published service offering(s), pruned ${pruned} stale document(s).`,
);
process.exit(0);
