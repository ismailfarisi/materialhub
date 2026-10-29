import { Check, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { User } from "./user.entity.ts";

@Entity("user_follows")
@Check(`"follower_id" <> "followee_id"`)
export class UserFollow {
  @PrimaryColumn("uuid")
  follower_id!: string;

  @PrimaryColumn("uuid")
  followee_id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "follower_id" })
  follower?: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "followee_id" })
  followee?: User;

  @CreateDateColumn({ name: "followed_at", type: "timestamptz" })
  followed_at!: Date;
}
