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
import { AddressType } from "../enums.ts";
import type { User } from "./user.entity.ts";

@Entity("user_addresses")
export class UserAddress {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  user_id!: string;

  @ManyToOne("User", "addresses", { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "varchar", length: 100 })
  label!: string;

  @Column({ type: "enum", enum: AddressType })
  type!: AddressType;

  @Column({ type: "varchar", length: 100 })
  first_name!: string;

  @Column({ type: "varchar", length: 100 })
  last_name!: string;

  @Column({ type: "varchar", length: 20 })
  phone!: string;

  @Column({ type: "varchar", length: 255 })
  address_line_1!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  address_line_2!: string | null;

  // UAE addresses are building/unit-centric (no postal codes). Building name is
  // required at the form level; all three are nullable so rows predating these
  // columns stay valid.
  @Column({ type: "varchar", length: 150, nullable: true })
  building_name!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  apartment!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  floor!: string | null;

  @Column({ type: "varchar", length: 100 })
  city!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  state!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  postal_code!: string | null;

  @Column({ type: "char", length: 2 })
  country_code!: string;

  @Column({ type: "numeric", precision: 10, scale: 7, nullable: true })
  latitude!: number | null;

  @Column({ type: "numeric", precision: 10, scale: 7, nullable: true })
  longitude!: number | null;

  @Column({ type: "uuid", nullable: true })
  area_id!: string | null;

  @Column({ type: "boolean", default: false })
  is_default!: boolean;

  @Column({ type: "varchar", length: 500, nullable: true })
  delivery_notes!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
