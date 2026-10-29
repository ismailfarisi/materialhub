import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CollabApplicationStatus } from "../enums.ts";

/**
 * One creator's participation in a collab opportunity — either a direct invite
 * the vendor seeded (`invited`) or the creator's own application off the board
 * (`applied`). One row per creator per opportunity, enforced by a partial unique
 * index that respects soft delete.
 */
@Entity("collab_applications")
export class CollabApplication {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ type: "uuid" }) opportunity_id!: string;
  @Column({ type: "uuid" }) creator_id!: string;
  @Column({ type: "enum", enum: CollabApplicationStatus })
  status!: CollabApplicationStatus;

  /** The creator's note. Null on a direct invite until they respond. */
  @Column({ type: "text", nullable: true }) pitch!: string | null;

  /** The vendor's personal note, written when they sent the invite. The
   *  creator-facing counterpart of `pitch`, and the only free text a vendor
   *  can put in front of a creator before the collab is accepted. */
  @Column({ type: "text", nullable: true }) invite_note!: string | null;
  /** Creator's counter-offer in fils, when the vendor allows one. */
  @Column({ type: "bigint", nullable: true }) proposed_fee_fils!: string | null;
  /** Snapshotted at accept so a later edit to the opportunity cannot move it. */
  @Column({ type: "bigint", nullable: true }) agreed_fee_fils!: string | null;

  /** The reel that satisfied the deliverable. Null for event_appearance, which
   *  produces no reel. */
  @Column({ type: "uuid", nullable: true }) delivered_reel_id!: string | null;

  // ── product_seeding ──────────────────────────────────────────────────────
  /** The creator's chosen address. NEVER serialized into a vendor-facing
   *  response — vendors see only whether one exists (spec §7.5). */
  @Column({ type: "uuid", nullable: true }) shipping_address_id!: string | null;
  /** Carrier + tracking recorded directly, not an FK to `shipments`: that table
   *  requires order_id and vendor_order_id, and a seeded product has neither. */
  @Column({ type: "varchar", length: 100, nullable: true }) carrier!: string | null;
  @Column({ type: "varchar", length: 255, nullable: true }) tracking_number!: string | null;
  @Column({ type: "timestamptz", nullable: true }) shipped_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) received_at!: Date | null;
  /** Absolute deadline, resolved at receipt so shipping time does not eat into
   *  the creator's window and a later opportunity edit cannot move it. */
  @Column({ type: "timestamptz", nullable: true }) deliver_by!: Date | null;

  @Column({ type: "integer", default: 0 }) revision_count!: number;

  @Column({ type: "timestamptz", nullable: true }) responded_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) accepted_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) delivered_at!: Date | null;
  @Column({ type: "timestamptz", nullable: true }) completed_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updated_at!: Date;
  @DeleteDateColumn({ type: "timestamptz", nullable: true }) deleted_at!: Date | null;
}
