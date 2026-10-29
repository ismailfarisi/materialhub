import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("banners")
export class Banner {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  subtitle!: string | null;

  @Column({ type: "varchar", length: 1024 })
  image_url!: string;

  @Column({ type: "varchar", length: 1024, nullable: true })
  mobile_image_url!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  link_url!: string | null;

  @Column({ type: "varchar", length: 100 })
  placement!: string;

  @Column({ type: "timestamptz", nullable: true })
  starts_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  expires_at!: Date | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "integer", default: 0 })
  sort_order!: number;

  @Column({ type: "varchar", length: 10, nullable: true })
  locale!: string | null;

  @Column({ type: "jsonb", nullable: true })
  target_audience!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
