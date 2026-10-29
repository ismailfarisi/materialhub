import { AppDataSource } from "@materialhub/database";
import { SearchReindexService } from "../apps/product-service/src/domain/search/search-reindex.service.ts";

async function main() {
  console.log("Starting Typesense reindex...");

  const service = new SearchReindexService();
  const total = await service.reindexAll(({ processed, total }) => {
    console.log(`Indexed ${processed}/${total}`);
  });

  console.log(`Reindex complete: ${total} products indexed`);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Reindex failed:", err);
  process.exit(1);
});
