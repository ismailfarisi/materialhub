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
import type { Product } from "./product.entity.ts";
import type { User } from "./user.entity.ts";

@Entity("product_questions")
export class ProductQuestion {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  product_id!: string;

  @ManyToOne("Product")
  @JoinColumn({ name: "product_id" })
  product!: Product;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User")
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "text" })
  question!: string;

  @Column({ type: "text", nullable: true })
  answer!: string | null;

  @Column({ type: "uuid", nullable: true })
  answered_by!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "answered_by" })
  answeredByUser!: User | null;

  @Column({ type: "timestamptz", nullable: true })
  answered_at!: Date | null;

  @Column({ type: "boolean", default: false })
  is_published!: boolean;

  @Column({ type: "integer", default: 0 })
  upvote_count!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
