import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { BusinessMemberRole, BusinessMemberStatus } from "../enums.ts";
import type { BusinessAccount } from "./business-account.entity.ts";
import type { User } from "./user.entity.ts";

/**
 * A user's role in a business account. Invites are rows with status
 * `invited` and no user_id; the invited user accepts by signing in with the
 * same email address.
 */
@Entity("business_members")
@Index("uq_business_members_active_user", ["user_id"], {
  unique: true,
  where: "status = 'active'",
})
@Index("uq_business_members_account_email", ["business_account_id", "email"], {
  unique: true,
  where: "status <> 'removed'",
})
export class BusinessMember {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  business_account_id!: string;

  @ManyToOne("BusinessAccount", "members")
  @JoinColumn({ name: "business_account_id" })
  businessAccount!: BusinessAccount;

  @Column({ type: "uuid", nullable: true })
  user_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  /** Lower-cased. */
  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({
    type: "enum",
    enum: BusinessMemberRole,
    enumName: "business_member_role_enum",
    default: BusinessMemberRole.buyer,
  })
  role!: BusinessMemberRole;

  @Column({
    type: "enum",
    enum: BusinessMemberStatus,
    enumName: "business_member_status_enum",
    default: BusinessMemberStatus.invited,
  })
  status!: BusinessMemberStatus;

  @Column({ type: "uuid", nullable: true })
  invited_by!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  invited_at!: Date;

  @Column({ type: "timestamptz", nullable: true })
  joined_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  removed_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
