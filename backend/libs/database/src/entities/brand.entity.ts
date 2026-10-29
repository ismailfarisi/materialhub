import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { BrandStatus } from "../enums/product.enums.ts";

@Entity("brands")
export class Brand {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255, unique: true })
  slug!: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  logo_url!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  website_url!: string | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "boolean", default: false })
  is_featured!: boolean;

  @Column({ type: "integer", default: 0 })
  sort_order!: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  meta_title!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  meta_description!: string | null;

  @Column({ type: "integer", default: 0 })
  product_count!: number;

  // ─── Moderation ────────────────────────────────────────────────────────
  // A vendor can submit a brand the catalogue is missing. The row exists from
  // submission so the vendor can put products against it right away, and every
  // public reader filters on `approved` until an admin says otherwise.

  @Index({ where: "deleted_at IS NULL" })
  @Column({ type: "enum", enum: BrandStatus, default: BrandStatus.approved })
  status!: BrandStatus;

  /** Who asked for this brand. Provenance for the review queue only — it
   *  confers no ownership and no edit rights once approved, because an
   *  approved brand is shared catalogue data. Null for admin-created brands. */
  @Column({ type: "uuid", nullable: true })
  submitted_by_vendor_id!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  submitted_at!: Date | null;

  @Column({ type: "uuid", nullable: true })
  reviewed_by_user_id!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  reviewed_at!: Date | null;

  /** Shown back to the submitting vendor on rejection. */
  @Column({ type: "text", nullable: true })
  rejection_reason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
