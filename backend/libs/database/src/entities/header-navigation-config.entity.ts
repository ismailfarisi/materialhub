import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type HeaderNavStatus = "draft" | "published";

export interface HeaderNavLocaleField {
  en: string;
  ar?: string;
  hi?: string;
  ml?: string;
  ur?: string;
}

export interface HeaderNavBrandList {
  title: HeaderNavLocaleField;
  see_all_href: string;
  brand_ids: string[]; // max 10
}

export interface HeaderNavPromoTile {
  id: string;
  image_url: string;
  title: HeaderNavLocaleField;
  cta_text: HeaderNavLocaleField;
  href: string;
}

export interface HeaderNavTab {
  id: string;
  kind: "category" | "custom";
  category_id: string | null;
  href_override: string | null;
  label: HeaderNavLocaleField;
  show_subcategories: boolean;
  enabled: boolean;
  position: number;
  brand_list: HeaderNavBrandList;
  promo_tiles: HeaderNavPromoTile[]; // 0..3
}

export interface HeaderNavConfig {
  tabs: HeaderNavTab[];
}

@Entity("header_navigation_configs")
export class HeaderNavigationConfig {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ type: "integer", default: 1 }) version!: number;

  @Column({ type: "varchar", length: 20, default: "draft" })
  status!: HeaderNavStatus;

  @Column({ type: "timestamptz", nullable: true }) published_at!: Date | null;
  @Column({ type: "jsonb" }) config!: HeaderNavConfig;
  @Column({ type: "uuid" }) created_by!: string;

  @CreateDateColumn({ type: "timestamptz" }) created_at!: Date;
  @UpdateDateColumn({ type: "timestamptz" }) updated_at!: Date;
  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
