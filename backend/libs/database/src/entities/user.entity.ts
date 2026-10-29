import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserRole, UserStatus } from "../enums.ts";
import type { Cart } from "./cart.entity.ts";
import type { Notification } from "./notification.entity.ts";
import type { Order } from "./order.entity.ts";
import type { Review } from "./review.entity.ts";
import type { SavedSearch } from "./saved-search.entity.ts";
import type { UserAddress } from "./user-address.entity.ts";
import type { UserSession } from "./user-session.entity.ts";
import type { UserToken } from "./user-token.entity.ts";
import type { UserTwoFactor } from "./user-two-factor.entity.ts";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100 })
  first_name!: string;

  @Column({ type: "varchar", length: 100 })
  last_name!: string;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 255, unique: true })
  email!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  phone_verified_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  email_verified_at!: Date | null;

  @Column({ type: "varchar", length: 255 })
  password_hash!: string;

  @Column({ type: "boolean", default: false })
  must_change_password!: boolean;

  @Column({ type: "integer", default: 1 })
  token_version!: number;

  @Column({ type: "enum", enum: UserRole, default: UserRole.customer })
  role!: UserRole;

  @Column({
    type: "enum",
    enum: UserStatus,
    default: UserStatus.pending_verification,
  })
  status!: UserStatus;

  @Column({ type: "varchar", length: 1024, nullable: true })
  avatar_url!: string | null;

  @Column({ type: "varchar", length: 10, default: "en" })
  preferred_locale!: string;

  @Column({ type: "varchar", length: 3, default: "AED" })
  preferred_currency!: string;

  @Column({ type: "varchar", length: 512, nullable: true })
  fcm_token!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  last_login_at!: Date | null;

  @Column({ type: "smallint", default: 0 })
  login_attempts!: number;

  @Column({ type: "timestamptz", nullable: true })
  locked_until!: Date | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  google_id!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  apple_id!: string | null;

  @Column({ type: "integer", default: 0 })
  wallet_balance!: number;

  @Column({ type: "varchar", length: 3, default: "AED" })
  wallet_currency!: string;

  @Column({ type: "int", default: 0 })
  follower_count!: number;

  @Column({ type: "int", default: 0 })
  following_count!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("UserAddress", "user")
  addresses!: UserAddress[];

  @OneToMany("UserSession", "user")
  sessions!: UserSession[];

  @OneToMany("UserToken", "user")
  tokens!: UserToken[];

  @OneToOne("UserTwoFactor", "user")
  twoFactor!: UserTwoFactor;

  // Phase 3b: removed `vendor` OneToOne relation. vendors.user_id was dropped;
  // a user's vendor memberships are now expressed via the vendor_members table.

  @OneToMany("Notification", "user")
  notifications!: Notification[];

  @OneToMany("Order", "user")
  orders!: Order[];

  @OneToMany("Review", "user")
  reviews!: Review[];

  @OneToMany("Cart", "user")
  carts!: Cart[];

  @OneToMany("SavedSearch", "user")
  savedSearches!: SavedSearch[];
}
