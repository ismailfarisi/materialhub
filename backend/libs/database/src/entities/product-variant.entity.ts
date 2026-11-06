import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { UnitOfMeasure } from "../enums/product.enums.ts";
import type { Product } from "./product.entity.ts";
import type { VariantPriceTier } from "./variant-price-tier.entity.ts";

const UNIT_SQL = "'sheet', 'roll', 'metre', 'pack', 'carton', 'box', 'piece', 'kg'";

@Entity("product_variants")
@Index("UQ_product_variants_one_sample", ["product_id"], {
  unique: true,
  where: '"is_sample" AND "deleted_at" IS NULL',
})
@Check(
  "CHK_product_variants_unit_of_measure",
  `"unit_of_measure" IS NULL OR "unit_of_measure" IN (${UNIT_SQL})`,
)
@Check(
  "CHK_product_variants_pack_contents_unit",
  `"pack_contents_unit" IS NULL OR "pack_contents_unit" IN (${UNIT_SQL})`,
)
@Check("CHK_product_variants_units_per_pack", `"units_per_pack" IS NULL OR "units_per_pack" >= 1`)
@Check("CHK_product_variants_min_order_quantity", `"min_order_quantity" >= 1`)
@Check("CHK_product_variants_order_increment", `"order_increment" >= 1`)
@Check(
  "CHK_product_variants_sample_max_quantity",
  `"sample_max_quantity" IS NULL OR "sample_max_quantity" >= 1`,
)
@Check(
  "CHK_product_variants_sample_terms",
  `NOT "is_sample" OR ("min_order_quantity" = 1 AND "order_increment" = 1)`,
)
export class ProductVariant {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  sku!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  external_id!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  barcode!: string | null;

  @Column({ type: "jsonb" })
  option_values!: Record<string, unknown>;

  @Column({ type: "integer" })
  price!: number;

  @Column({ type: "integer", nullable: true })
  compare_at_price!: number | null;

  @Column({ type: "integer", nullable: true })
  cost_price!: number | null;

  @Column({ type: "jsonb", nullable: true })
  price_overrides!: Record<string, unknown> | null;

  @Column({ type: "integer", nullable: true })
  weight_grams!: number | null;

  @Column({ type: "jsonb", nullable: true })
  dimensions_cm!: Record<string, unknown> | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  // ── Trade pricing ────────────────────────────────────────────────
  // `price` is the base unit price in fils, charged from the minimum order
  // quantity up to the first price tier. Quantities are counted in
  // `unit_of_measure`.

  /** What one unit buys (sheet, roll, metre, pack, carton, box, piece, kg). Null = not stated. */
  @Column({ type: "varchar", length: 16, nullable: true })
  unit_of_measure!: UnitOfMeasure | null;

  /** For a pack, carton or box: how many inner units it holds (e.g. 100 sheets). */
  @Column({ type: "integer", nullable: true })
  units_per_pack!: number | null;

  /** The inner unit counted by `units_per_pack` (e.g. "sheet"). */
  @Column({ type: "varchar", length: 16, nullable: true })
  pack_contents_unit!: UnitOfMeasure | null;

  /** Smallest quantity a buyer may order in one line. */
  @Column({ type: "integer", default: 1 })
  min_order_quantity!: number;

  /** Quantities above the minimum go up in steps of this many units. */
  @Column({ type: "integer", default: 1 })
  order_increment!: number;

  /** A sample of the material: capped quantity, sample shipping rate, no tiers. */
  @Column({ type: "boolean", default: false })
  is_sample!: boolean;

  /** Per-order cap for a sample variant. Null = the platform default (see trade pricing docs). */
  @Column({ type: "integer", nullable: true })
  sample_max_quantity!: number | null;

  @OneToMany("VariantPriceTier", "variant")
  price_tiers!: VariantPriceTier[];

  @Column({ type: "smallint", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
