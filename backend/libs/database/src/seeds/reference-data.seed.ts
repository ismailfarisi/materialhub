import type { DataSource } from "typeorm";
import { applyReferenceData } from "../reference-data/reference-data.ts";

/**
 * Reference data (permission matrix, payment thresholds, sales channels,
 * section types and the vendor storefront template, platform shipping, feature
 * settings). Same lists and insert-if-missing rules as the
 * RestoreReferenceData migration; run here too so the vendor storefront
 * template is created once the seed's super_admin exists (the migration has no
 * owner for it on an empty database).
 */
export async function seedReferenceData(ds: DataSource): Promise<void> {
  const counts = await ds.transaction((em) => applyReferenceData(em));
  const added = Object.entries(counts).filter(([, n]) => n > 0);
  console.log(
    added.length > 0
      ? `  ✓ Reference data: ${added.map(([table, n]) => `${table} +${n}`).join(", ")}`
      : "  – Reference data already present, skipping",
  );
}
