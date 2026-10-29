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
import type { ServiceOffering } from "./service-offering.entity.ts";

@Entity("service_offering_translations")
@Index(["offering_id", "locale"], { unique: true, where: "deleted_at IS NULL" })
export class ServiceOfferingTranslation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  offering_id!: string;

  @ManyToOne("ServiceOffering", "translations", { onDelete: "CASCADE" })
  @JoinColumn({ name: "offering_id" })
  offering!: ServiceOffering;

  @Column({ type: "varchar", length: 8 })
  locale!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
