import type { MigrationInterface, QueryRunner } from "typeorm";

export class ProductCollections1780200000000 implements MigrationInterface {
  name = "ProductCollections1780200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE product_collection_kind AS ENUM ('product', 'variant');
      CREATE TYPE product_collection_sort AS ENUM ('custom', 'price_asc', 'price_desc', 'newest', 'rating');
      CREATE TYPE product_collection_item_role AS ENUM ('pin', 'exclude');
    `);

    await queryRunner.query(`
      CREATE TABLE product_collections (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name          varchar(255) NOT NULL,
        slug          varchar(255) NOT NULL,
        description   text NULL,
        kind          product_collection_kind NOT NULL DEFAULT 'product',
        rules         jsonb NULL,
        default_sort  product_collection_sort NOT NULL DEFAULT 'custom',
        max_products  integer NULL,
        starts_at     timestamptz NULL,
        ends_at       timestamptz NULL,
        is_active     boolean NOT NULL DEFAULT true,
        created_by    uuid NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        deleted_at    timestamptz NULL
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX product_collections_slug_uq
        ON product_collections (slug) WHERE deleted_at IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE product_collection_items (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id uuid NOT NULL REFERENCES product_collections(id) ON DELETE CASCADE,
        product_id    uuid NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id    uuid NULL REFERENCES product_variants(id) ON DELETE CASCADE,
        role          product_collection_item_role NOT NULL,
        position      integer NOT NULL DEFAULT 0,
        source_sku    varchar(100) NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        deleted_at    timestamptz NULL,
        CONSTRAINT product_collection_items_one_target
          CHECK ((product_id IS NOT NULL) <> (variant_id IS NOT NULL))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX product_collection_items_lookup
        ON product_collection_items (collection_id, role, position);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX product_collection_items_product_uq
        ON product_collection_items (collection_id, product_id)
        WHERE deleted_at IS NULL AND product_id IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX product_collection_items_variant_uq
        ON product_collection_items (collection_id, variant_id)
        WHERE deleted_at IS NULL AND variant_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE product_collection_members (
        collection_id uuid NOT NULL REFERENCES product_collections(id) ON DELETE CASCADE,
        product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        refreshed_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (collection_id, product_id)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX product_collection_members_product
        ON product_collection_members (product_id);
    `);

    await queryRunner.query(`
      ALTER TYPE coupon_applicable_to ADD VALUE IF NOT EXISTS 'specific_collection';
    `);
    await queryRunner.query(`
      ALTER TABLE coupons ADD COLUMN collection_id uuid NULL
        REFERENCES product_collections(id) ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE coupons DROP COLUMN IF EXISTS collection_id;");
    await queryRunner.query("DROP TABLE IF EXISTS product_collection_members CASCADE;");
    await queryRunner.query("DROP TABLE IF EXISTS product_collection_items CASCADE;");
    await queryRunner.query("DROP TABLE IF EXISTS product_collections CASCADE;");
    await queryRunner.query("DROP TYPE IF EXISTS product_collection_item_role;");
    await queryRunner.query("DROP TYPE IF EXISTS product_collection_sort;");
    await queryRunner.query("DROP TYPE IF EXISTS product_collection_kind;");
    // Note: the 'specific_collection' enum value is intentionally NOT removed —
    // Postgres cannot drop a single enum value. Harmless to leave.
  }
}
