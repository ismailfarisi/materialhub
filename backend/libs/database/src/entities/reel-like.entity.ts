import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Reel } from "./reel.entity.ts";
import { User } from "./user.entity.ts";

@Entity("reel_likes")
export class ReelLike {
  @PrimaryColumn("uuid")
  reel_id!: string;

  @PrimaryColumn("uuid")
  user_id!: string;

  @ManyToOne(() => Reel, { onDelete: "CASCADE" })
  @JoinColumn({ name: "reel_id" })
  reel?: Reel;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user?: User;

  @CreateDateColumn({ name: "liked_at", type: "timestamptz" })
  liked_at!: Date;
}
