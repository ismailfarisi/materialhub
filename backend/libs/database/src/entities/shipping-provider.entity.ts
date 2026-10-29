import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("shipping_providers")
export class ShippingProvider {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("shipping_providers_code_uq", { unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 50 })
  code!: string;

  @Column({ type: "varchar", length: 255 })
  display_name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "text", nullable: true })
  logo_url!: string | null;

  @Column({ type: "jsonb" })
  credential_schema!: Record<string, unknown>;

  @Column({ type: "text", array: true, default: "{}" })
  supported_regions!: string[];

  @Column({ type: "varchar", length: 512, nullable: true })
  webhook_secret_encrypted!: string | null;

  @Column({ type: "boolean", default: false })
  is_active!: boolean;

  @Column({ type: "integer", default: 0 })
  sort_order!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
