import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ProductGroupListingMode } from "../enums.ts";
import type { Attribute } from "./attribute.entity.ts";
import type { ProductGroupMember } from "./product-group-member.entity.ts";
import type { Vendor } from "./vendor.entity.ts";

@Entity("product_groups")
export class ProductGroup {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  vendor_id!: string;

  @ManyToOne("Vendor")
  @JoinColumn({ name: "vendor_id" })
  vendor!: Vendor;

  @Column({ type: "uuid", nullable: true })
  category_id!: string | null;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "uuid" })
  grouping_attribute_id!: string;

  @ManyToOne("Attribute")
  @JoinColumn({ name: "grouping_attribute_id" })
  groupingAttribute!: Attribute;

  @Column({
    type: "enum",
    enum: ProductGroupListingMode,
    default: ProductGroupListingMode.collapsed,
  })
  listing_mode!: ProductGroupListingMode;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;

  @OneToMany("ProductGroupMember", "group")
  members!: ProductGroupMember[];
}
