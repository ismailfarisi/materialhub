import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { Reel } from "./reel.entity.ts";
import { User } from "./user.entity.ts";

@Entity("reel_views")
@Check('"completion_percentage" BETWEEN 0 AND 1')
export class ReelView {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id!: string;

  @Column({ type: "uuid", nullable: true })
  user_id!: string | null;

  @Column("uuid")
  reel_id!: string;

  @Column({ type: "uuid", nullable: true })
  session_id!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "user_id" })
  user?: User | null;

  @ManyToOne(() => Reel, { onDelete: "CASCADE" })
  @JoinColumn({ name: "reel_id" })
  reel?: Reel;

  @CreateDateColumn({ name: "viewed_at", type: "timestamptz" })
  viewed_at!: Date;

  @Column({ type: "numeric", precision: 6, scale: 2 })
  watch_duration_seconds!: string;

  @Column({ type: "numeric", precision: 5, scale: 4 })
  completion_percentage!: string;

  @Column({ type: "text", nullable: true })
  device_type?: string | null;
}
