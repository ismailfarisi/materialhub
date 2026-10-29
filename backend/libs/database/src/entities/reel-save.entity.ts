import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Reel } from "./reel.entity.ts";
import { User } from "./user.entity.ts";

@Entity("reel_saves")
export class ReelSave {
  @PrimaryColumn("uuid")
  user_id!: string;

  @PrimaryColumn("uuid")
  reel_id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "user_id" })
  user?: User;

  @ManyToOne(() => Reel, { onDelete: "CASCADE" })
  @JoinColumn({ name: "reel_id" })
  reel?: Reel;

  @CreateDateColumn({ name: "saved_at", type: "timestamptz" })
  saved_at!: Date;
}
