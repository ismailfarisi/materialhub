import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import {
  CollabOpportunityStatus,
  CollabOpportunityType,
  CollabVisibility,
  ReelLicenseFundingSource,
  ReelLicenseRightsScope,
  SocialPlatform,
} from "../enums.ts";

export interface CollabDeliverable {
  kind: "reel" | "story" | "post" | "appearance";
  count: number;
}

/**
 * A vendor's offer of collaboration to creators — seeding a product, a paid
 * campaign, or an event appearance. Either published to the open board
 * (`visibility = board`, any eligible creator may apply) or sent to named
 * creators as a direct invite (`visibility = direct`).
 *
 * Type-specific columns are nullable at the column level and enforced by the
 * `ck_collab_type_fields` CHECK constraint, which applies to drafts too — a
 * draft that could never become a valid opportunity is not worth storing.
 */
@Entity("collab_opportunities")
export class CollabOpportunity {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ type: "uuid" }) vendor_id!: string;
  @Column({ type: "enum", enum: CollabOpportunityType }) type!: CollabOpportunityType;
  @Column({ type: "enum", enum: CollabVisibility }) visibility!: CollabVisibility;
  @Column({ type: "enum", enum: CollabOpportunityStatus, default: CollabOpportunityStatus.draft })
  status!: CollabOpportunityStatus;

  @Column({ type: "varchar", length: 200 }) title!: string;
  @Column({ type: "text" }) description!: string;
  @Column({ type: "jsonb", nullable: true }) deliverables!: CollabDeliverable[] | null;
  @Column({ type: "integer", default: 1 }) slots_total!: number;
  @Column({ type: "integer", default: 0 }) slots_filled!: number;
  @Column({ type: "timestamptz", nullable: true }) applications_close_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) deliver_by!: Date | null;

  /** Eligibility floor on combined audience reach. Null = no floor. */
  @Column({ type: "integer", nullable: true }) min_follower_count!: number | null;
  /** Null or empty = any platform. */
  @Column({ type: "enum", enum: SocialPlatform, array: true, nullable: true })
  required_platforms!: SocialPlatform[] | null;
  /** Null or empty = any category. */
  @Column({ type: "varchar", length: 100, array: true, nullable: true })
  required_categories!: string[] | null;
  /** Required for the types that produce a reel. */
  @Column({ type: "enum", enum: ReelLicenseRightsScope, nullable: true })
  rights_scope!: ReelLicenseRightsScope | null;

  // ── paid_campaign ────────────────────────────────────────────────────────
  /** Per-creator fee in fils. */
  @Column({ type: "bigint", nullable: true }) fee_fils!: string | null;
  @Column({ type: "enum", enum: ReelLicenseFundingSource, nullable: true })
  funding_source!: ReelLicenseFundingSource | null;

  // ── product_seeding ──────────────────────────────────────────────────────
  @Column({ type: "uuid", nullable: true }) seeded_product_id!: string | null;
  @Column({ type: "uuid", nullable: true }) seeded_variant_id!: string | null;
  @Column({ type: "integer", nullable: true }) seeded_qty!: number | null;
  /** Retail value in fils, snapshotted at publish. Reporting only — no money moves. */
  @Column({ type: "bigint", nullable: true }) seeding_value_fils!: string | null;

  // ── event_appearance ─────────────────────────────────────────────────────
  /** The vendor's own location. Deliberately NOT wired to the booking availability
   *  engine — a creator is not a staff member (spec §7.6). */
  @Column({ type: "uuid", nullable: true }) location_id!: string | null;
  @Column({ type: "timestamptz", nullable: true }) starts_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) ends_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updated_at!: Date;
  @DeleteDateColumn({ type: "timestamptz", nullable: true }) deleted_at!: Date | null;
}
