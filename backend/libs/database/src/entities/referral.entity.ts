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
import type { Order } from "./order.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("referrals")
export class Referral {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  referrer_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "referrer_id" })
  referrer!: User;

  @Column({ type: "uuid", nullable: true })
  referred_id!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "referred_id" })
  referred!: User | null;

  @Index({ unique: true, where: "deleted_at IS NULL" })
  @Column({ type: "varchar", length: 50, unique: true })
  referral_code!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  referred_email!: string | null;

  @Column({ type: "varchar", length: 50 })
  status!: string;

  @Column({ type: "integer", nullable: true })
  referrer_reward_amount!: number | null;

  @Column({ type: "integer", nullable: true })
  referred_reward_amount!: number | null;

  @Column({ type: "uuid", nullable: true })
  qualifying_order_id!: string | null;

  @ManyToOne("Order", { nullable: true })
  @JoinColumn({ name: "qualifying_order_id" })
  qualifyingOrder!: Order | null;

  @Column({ type: "timestamptz", nullable: true })
  rewarded_at!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  expires_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
