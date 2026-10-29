import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ProductCollectionItemRole } from "../enums.ts";

@Entity("product_collection_items")
@Index(["collection_id", "role", "position"])
@Index(["collection_id", "product_id"], {
  unique: true,
  where: "deleted_at IS NULL AND product_id IS NOT NULL",
})
@Index(["collection_id", "variant_id"], {
  unique: true,
  where: "deleted_at IS NULL AND variant_id IS NOT NULL",
})
export class ProductCollectionItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  collection_id!: string;

  @Column({ type: "uuid", nullable: true })
  product_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  variant_id!: string | null;

  @Column({ type: "enum", enum: ProductCollectionItemRole })
  role!: ProductCollectionItemRole;

  @Column({ type: "integer", default: 0 })
  position!: number;

  @Column({ type: "varchar", length: 100, nullable: true })
  source_sku!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
