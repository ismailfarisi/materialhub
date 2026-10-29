import "reflect-metadata";
import { AppDataSource } from "./data-source.ts";

async function run() {
  const ds = await AppDataSource.initialize();
  console.log("Database connected — running migrations...");

  const migrations = await ds.runMigrations({ transaction: "each" });
  if (migrations.length === 0) {
    console.log("No pending migrations.");
  } else {
    for (const m of migrations) {
      console.log(`  ✓ ${m.name}`);
    }
    console.log(`\n${migrations.length} migration(s) executed.`);
  }

  await ds.destroy();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
