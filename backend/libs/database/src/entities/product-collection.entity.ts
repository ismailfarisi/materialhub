import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ProductCollectionKind, ProductCollectionSort } from "../enums.ts";

export interface CollectionRules {
  v: number;
  match: "all" | "any";
  conditions: {
    category_slugs?: string[];
    brand_slugs?: string[];
    tags?: string[];
    sku_in?: string[];
    price_min?: number;
    price_max?: number;
    in_stock?: boolean;
  };
}

@Entity("product_collections")
export class ProductCollection {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255, unique: true })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "enum", enum: ProductCollectionKind, default: ProductCollectionKind.product })
  kind!: ProductCollectionKind;

  @Column({ type: "jsonb", nullable: true })
  rules!: CollectionRules | null;

  @Column({ type: "enum", enum: ProductCollectionSort, default: ProductCollectionSort.custom })
  default_sort!: ProductCollectionSort;

  @Column({ type: "integer", nullable: true })
  max_products!: number | null;

  @Column({ type: "timestamptz", nullable: true })
  starts_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  ends_at!: Date | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "uuid", nullable: true })
  created_by!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
