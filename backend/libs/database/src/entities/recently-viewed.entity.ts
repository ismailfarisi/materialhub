import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { GuestSession } from "./guest-session.entity.ts";
import type { Product } from "./product.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("recently_viewed")
export class RecentlyViewed {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  user_id!: string | null;

  @ManyToOne("User", { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  @Column({ type: "uuid", nullable: true })
  guest_session_id!: string | null;

  @ManyToOne("GuestSession", { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "guest_session_id" })
  guest_session!: GuestSession | null;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product", { onDelete: "CASCADE" })
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "timestamptz", default: () => "now()" })
  viewed_at!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
