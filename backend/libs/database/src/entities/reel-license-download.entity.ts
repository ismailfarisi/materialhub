import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { ReelLicenseGrant } from "./reel-license-grant.entity.ts";

/** Append-only audit of off-platform download URL mints. No soft delete (immutable log). */
@Entity("reel_license_downloads")
export class ReelLicenseDownload {
  @PrimaryGeneratedColumn("uuid") id!: string;

  @Column({ type: "uuid" }) grant_id!: string;
  @ManyToOne("ReelLicenseGrant", { onDelete: "CASCADE" })
  @JoinColumn({ name: "grant_id" })
  grant?: ReelLicenseGrant;

  @Column({ type: "uuid" }) requested_by!: string;
  @Column({ type: "timestamptz" }) url_expires_at!: Date;

  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
}
