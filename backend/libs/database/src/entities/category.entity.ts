import {
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

@Entity("categories")
export class Category {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  parent_id!: string | null;

  @ManyToOne("Category", { nullable: true })
  @JoinColumn({ name: "parent_id" })
  parent!: Category | null;

  @OneToMany("Category", "parent")
  children!: Category[];

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255, unique: true })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  image_url!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  icon_url!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  banner_url!: string | null;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({ type: "boolean", default: false })
  is_featured!: boolean;

  @Column({ type: "integer", default: 0 })
  sort_order!: number;

  @Column({ type: "numeric", precision: 5, scale: 2, nullable: true })
  commission_rate!: number | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  meta_title!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  meta_description!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  meta_keywords!: string | null;

  @Column({ type: "text", nullable: true })
  path!: string | null;

  @Column({ type: "smallint", default: 0 })
  depth!: number;

  @Column({ type: "integer", default: 0 })
  product_count!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
