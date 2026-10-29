import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Category } from "./category.entity.ts";

@Entity("reel_hot_categories")
@Index("idx_rhc_last_recomputed", ["last_recomputed_at"])
export class ReelHotCategory {
  @PrimaryColumn({ type: "uuid" })
  category_id!: string;

  @PrimaryColumn({ type: "varchar", length: 5 })
  language_code!: string;

  @PrimaryColumn({ type: "varchar", length: 2 })
  country_code!: string;

  @Column({ type: "integer", default: 0 })
  reel_count_30d!: number;

  @Column({ type: "timestamptz", name: "last_recomputed_at", default: () => "now()" })
  last_recomputed_at!: Date;

  @ManyToOne(() => Category, { onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category!: Category;
}
