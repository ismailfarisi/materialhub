import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { EcoDeclarationStatus } from "../enums.ts";
import type { Product } from "./product.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

/**
 * A vendor's declaration that a product is "plastic-ban ready": that, to the
 * vendor's knowledge, it is not one of the single-use plastic items covered by
 * the UAE federal ban (in force since 1 January 2026). MaterialHub admins
 * review the declaration and any certificate; approval is a marketplace
 * listing check, not a legal certification.
 *
 * One row per product. Withdrawing keeps the row (status `withdrawn`) so the
 * review history stays auditable; re-declaring moves it back to `pending`.
 */
@Entity("product_eco_declarations")
@Index("IDX_product_eco_declarations_status", ["status", "submitted_at"])
export class ProductEcoDeclaration {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Unique: the one-to-one join column gets a UNIQUE constraint from TypeORM.
  @Column({ type: "uuid" })
  product_id!: string;

  @OneToOne("Product", "ecoDeclaration", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Index("IDX_product_eco_declarations_vendor")
  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor", { onDelete: "CASCADE" })
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({
    type: "enum",
    enum: EcoDeclarationStatus,
    enumName: "eco_declaration_status_enum",
    default: EcoDeclarationStatus.pending,
  })
  status!: EcoDeclarationStatus;

  /** Vendor's own note on why the product complies (materials, lining, thickness). */
  @Column({ type: "text", nullable: true })
  statement!: string | null;

  /** Private object-storage key (`private/eco-certificates/{vendorId}/...`). Never public. */
  @Column({ type: "varchar", length: 1024, nullable: true })
  certificate_key!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  certificate_filename!: string | null;

  /** Who ticked the declaration checkbox, and when. */
  @Column({ type: "uuid", nullable: true })
  declared_by!: string | null;

  @Column({ type: "timestamptz" })
  submitted_at!: Date;

  @Column({ type: "uuid", nullable: true })
  reviewed_by!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  reviewed_at!: Date | null;

  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
