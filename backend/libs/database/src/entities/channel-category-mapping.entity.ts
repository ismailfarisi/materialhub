import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("channel_category_mappings")
@Index("channel_category_mappings_uq", ["channel_id", "category_id"], {
  unique: true,
  where: "deleted_at IS NULL",
})
export class ChannelCategoryMapping {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  channel_id!: string;

  @Column({ type: "uuid" })
  category_id!: string;

  @Column({ type: "varchar", length: 64 })
  external_category_id!: string;

  @Column({ type: "text", nullable: true })
  external_category_path!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
