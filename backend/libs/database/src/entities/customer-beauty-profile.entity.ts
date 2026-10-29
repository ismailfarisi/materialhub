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
import {
  FragranceFamily,
  HairType,
  SkinConcern,
  SkinToneDepth,
  SkinType,
  Undertone,
} from "../enums.ts";
import type { User } from "./user.entity.ts";

@Index("uq_customer_beauty_profiles_user", ["user_id"], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity("customer_beauty_profiles")
export class CustomerBeautyProfile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "enum", enum: SkinType, enumName: "skin_type_enum", nullable: true })
  skin_type!: SkinType | null;

  @Column({
    type: "enum",
    enum: SkinConcern,
    enumName: "skin_concern_enum",
    array: true,
    nullable: true,
  })
  skin_concerns!: SkinConcern[] | null;

  @Column({
    type: "enum",
    enum: SkinToneDepth,
    enumName: "skin_tone_depth_enum",
    nullable: true,
  })
  skin_tone_depth!: SkinToneDepth | null;

  @Column({ type: "enum", enum: Undertone, enumName: "undertone_enum", nullable: true })
  undertone!: Undertone | null;

  @Column({ type: "enum", enum: HairType, enumName: "hair_type_enum", nullable: true })
  hair_type!: HairType | null;

  @Column({
    type: "enum",
    enum: FragranceFamily,
    enumName: "fragrance_family_enum",
    array: true,
    nullable: true,
  })
  fragrance_families!: FragranceFamily[] | null;

  @Column({ type: "timestamptz", nullable: true })
  completed_at!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
