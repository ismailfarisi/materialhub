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
import type { User } from "./user.entity.ts";

@Entity("newsletter_subscribers")
export class NewsletterSubscriber {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Stored trimmed + lowercased. Partial-unique on (email) WHERE deleted_at IS NULL
  // is enforced by the migration, not a decorator (TypeORM can't express the predicate).
  @Column({ type: "text" })
  email!: string;

  @Column({ type: "uuid", nullable: true })
  user_id!: string | null;

  @ManyToOne("User", { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "user_id" })
  user!: User | null;

  @Column({ type: "text", default: "en" })
  locale!: string;

  @Column({ type: "text", default: "homepage" })
  source!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  subscribed_at!: Date;

  @Column({ type: "timestamptz", nullable: true })
  unsubscribed_at!: Date | null;

  @Column({ type: "uuid", default: () => "gen_random_uuid()" })
  unsubscribe_token!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
