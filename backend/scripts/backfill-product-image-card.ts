#!/usr/bin/env bun
/**
 * Backfill script — populate product_images.card_url for rows uploaded before
 * the 320px card variant existed.
 *
 * For each row where card_url IS NULL, download the existing medium (or large)
 * processed variant from S3, resize to 320px webp via sharp, upload
 * processed/<uuid>/card.webp with the same immutable Cache-Control, then
 * UPDATE the row.
 *
 * Idempotent — re-running skips rows that already have card_url.
 *
 * Usage:
 *   bun run scripts/backfill-product-image-card.ts                 # full run
 *   bun run scripts/backfill-product-image-card.ts --dry-run       # plan only
 *   bun run scripts/backfill-product-image-card.ts --limit 500     # cap rows
 *   bun run scripts/backfill-product-image-card.ts --concurrency 16
 *
 * After the script finishes, run `bun run search:reindex` so Typesense picks
 * card_url instead of the medium_url fallback baked into the indexer.
 */

import { config } from "@materialhub/config";
import { AppDataSource, ProductImage } from "@materialhub/database";
import { MediaService } from "@materialhub/utils";

interface Args {
  dryRun: boolean;
  limit: number | null;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, limit: null, concurrency: 8 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--concurrency") args.concurrency = Number(argv[++i]);
  }
  if (args.concurrency < 1 || args.concurrency > 64) {
    throw new Error(`--concurrency must be between 1 and 64 (got ${args.concurrency})`);
  }
  return args;
}

interface Row {
  id: string;
  url: string;
  medium_url: string | null;
}

interface Stats {
  succeeded: number;
  skipped: number;
  failed: number;
}

async function processOne(
  row: Row,
  media: MediaService,
  dryRun: boolean,
): Promise<"ok" | "skipped" | "failed"> {
  // Prefer the medium variant as the source — smaller download, plenty of pixels
  // for a 320px output. Fall back to large.
  const sourceUrl = row.medium_url ?? row.url;
  const sourceKey = media.extractKeyFromPublicUrl(sourceUrl);
  if (!sourceKey) {
    console.warn(`[skip] row ${row.id}: cannot derive S3 key from ${sourceUrl}`);
    return "skipped";
  }

  // Target key sits in the same processed/<uuid>/ directory.
  const segments = sourceKey.split("/");
  const dir = segments.slice(0, -1).join("/");
  const targetKey = `${dir}/card.webp`;

  if (dryRun) {
    console.log(`[dry] ${row.id}: ${sourceKey} -> ${targetKey}`);
    return "ok";
  }

  let cardUrl: string;
  try {
    const result = await media.resizeFromExisting(sourceKey, targetKey, config.media.sizes.card);
    cardUrl = result.url;
  } catch (err) {
    console.warn(`[fail] row ${row.id}: ${sourceKey} -> ${targetKey} — ${(err as Error).message}`);
    return "failed";
  }

  await AppDataSource.getRepository(ProductImage).update(row.id, { card_url: cardUrl });
  return "ok";
}

async function processBatch(
  rows: Row[],
  media: MediaService,
  args: Args,
  stats: Stats,
): Promise<void> {
  // Bounded concurrency: chunk the batch into slices of args.concurrency.
  for (let i = 0; i < rows.length; i += args.concurrency) {
    const slice = rows.slice(i, i + args.concurrency);
    const results = await Promise.all(slice.map((r) => processOne(r, media, args.dryRun)));
    for (const r of results) {
      if (r === "ok") stats.succeeded++;
      else if (r === "skipped") stats.skipped++;
      else stats.failed++;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `Backfill product_images.card_url — dryRun=${args.dryRun}, limit=${args.limit ?? "none"}, concurrency=${args.concurrency}`,
  );

  await AppDataSource.initialize();
  const media = new MediaService();
  const repo = AppDataSource.getRepository(ProductImage);

  const BATCH_SIZE = 200;
  const stats: Stats = { succeeded: 0, skipped: 0, failed: 0 };
  let processed = 0;
  let lastId: string | null = null;

  const totalRemaining = await repo
    .createQueryBuilder("pi")
    .where("pi.card_url IS NULL")
    .andWhere("pi.url IS NOT NULL")
    .andWhere("pi.deleted_at IS NULL")
    .getCount();
  console.log(`Rows needing backfill: ${totalRemaining}`);

  while (true) {
    const remaining = args.limit != null ? args.limit - processed : Number.POSITIVE_INFINITY;
    if (remaining <= 0) break;
    const take = Math.min(BATCH_SIZE, remaining);

    const qb = repo
      .createQueryBuilder("pi")
      .select(["pi.id", "pi.url", "pi.medium_url"])
      .where("pi.card_url IS NULL")
      .andWhere("pi.url IS NOT NULL")
      .andWhere("pi.deleted_at IS NULL")
      .orderBy("pi.id", "ASC")
      .take(take);
    if (lastId) qb.andWhere("pi.id > :lastId", { lastId });

    const rows = (await qb.getMany()) as Row[];
    if (rows.length === 0) break;

    await processBatch(rows, media, args, stats);
    processed += rows.length;
    lastId = rows[rows.length - 1]!.id;

    console.log(
      `Progress: ${processed}${args.limit ? `/${args.limit}` : ""} — ok=${stats.succeeded} skipped=${stats.skipped} failed=${stats.failed}`,
    );
  }

  console.log(
    `\nDone. succeeded=${stats.succeeded} skipped=${stats.skipped} failed=${stats.failed}`,
  );
  await AppDataSource.destroy();
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
