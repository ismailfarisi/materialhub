import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Publishing was removed from the media-kit editor: saving is what makes a kit
 * visible to brands, and `CreatorMediaKitService.upsert` now forces
 * `is_published` true on every save.
 *
 * That leaves existing rows stranded. A kit saved but never published would
 * stay invisible with no control anywhere in the UI to change it — the creator
 * would have to guess that editing and re-saving some section fixes it. So this
 * flips them.
 *
 * READ THIS BEFORE RUNNING: this makes every already-saved media kit visible to
 * brands, including ones a creator deliberately kept unpublished. That is the
 * intended semantics of "saved = live", but it is a one-way change to content
 * people chose to hide. `down()` cannot undo it correctly — it has no record of
 * which rows were false beforehand — so it is deliberately a no-op rather than
 * a statement that would unpublish everybody, including creators who published
 * on purpose.
 *
 * If you would rather not flip existing rows, delete this migration before
 * running it; new saves publish either way.
 */
export class PublishExistingMediaKits1786300000000 implements MigrationInterface {
  name = "PublishExistingMediaKits1786300000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE "creator_media_kits"
         SET "is_published" = true,
             "updated_at" = now()
       WHERE "is_published" = false
         AND "deleted_at" IS NULL;
    `);
  }

  public async down(): Promise<void> {
    // Intentionally empty — see the note above. Reverting would have to guess
    // which kits were unpublished, and guessing wrong hides live kits.
  }
}
