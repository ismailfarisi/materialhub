import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { User } from "./user.entity.ts";

/** One headline figure on the kit — e.g. `{ label: "Followers", value: "68K+" }`. */
export interface CreatorMediaKitStat {
  label: string;
  value: string;
}

/** One slice of the audience donut, or one row of the locations table. */
export interface CreatorMediaKitSegment {
  label: string;
  percent: number;
}

/**
 * A creator's self-authored media kit — the page a vendor sees on the creator
 * directory's detail view.
 *
 * Every figure here is typed by the creator, not measured by the platform:
 * `stats`, `audience` and `top_locations` are claims, and the vendor-facing
 * page labels them as such. That was a deliberate product call — the platform
 * does hold measurable reach (daily_creator_metrics) and follower counts
 * (user_follows), but this table is not derived from either.
 *
 * Identity (name, bio, category, avatar) is NOT duplicated here — it is read
 * from the latest approved creator_applications row plus users.avatar_url, the
 * same source the directory list uses. Contact details are deliberately absent:
 * social_links live on creator_applications and are never served to a vendor,
 * who reaches a creator only through a collab invite.
 */
@Entity("creator_media_kits")
@Index("uq_media_kit_per_user", ["user_id"], { unique: true, where: "deleted_at IS NULL" })
export class CreatorMediaKit {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  /** Line under the name — "Beauty & Makeup Creator". */
  @Column({ type: "varchar", length: 120, nullable: true })
  headline!: string | null;

  /** Short pull-quote set in script type on the kit. */
  @Column({ type: "varchar", length: 160, nullable: true })
  pull_quote!: string | null;

  /** The "About me" paragraph — longer and more personal than the directory bio. */
  @Column({ type: "text", nullable: true })
  about!: string | null;

  /** Where the creator is based, as they choose to phrase it ("Dubai, UAE"). */
  @Column({ type: "varchar", length: 120, nullable: true })
  location_label!: string | null;

  /** Up to 4 headline figures, in display order. Values are free text so a
   *  creator can write "68K+" or "1.2M+" rather than a bare integer. */
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  stats!: CreatorMediaKitStat[];

  /** "Content I create" — up to 8 short labels. */
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  content_types!: string[];

  /** Audience donut slices, up to 6. Percentages are not required to total 100. */
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  audience!: CreatorMediaKitSegment[];

  /** Top locations table, up to 6 rows. */
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  top_locations!: CreatorMediaKitSegment[];

  /** Closing note in the collaborations band. */
  @Column({ type: "text", nullable: true })
  collaboration_note!: string | null;

  /** Vendors see the kit only once the creator publishes it; until then the
   *  directory detail page falls back to the plain application identity. */
  @Column({ type: "boolean", default: false })
  is_published!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
