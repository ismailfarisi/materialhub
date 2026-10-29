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

// A phone number this user has proven they control, via OTP. Separate from
// users.phone_verified_at, which covers only their login number: a customer
// may ship to a spouse, a driver, or a reception desk.
@Entity("user_verified_phones")
@Index("uq_user_verified_phone", ["user_id", "phone"], {
  unique: true,
  where: "deleted_at IS NULL",
})
export class UserVerifiedPhone {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  /** Always E.164, normalized via normalizePhoneForOtp before write. */
  @Column({ type: "varchar", length: 20 })
  phone!: string;

  @Column({ type: "timestamptz" })
  verified_at!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
