import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

// Home-visit coverage: which hyperlocal zones a vendor will travel to.
@Entity("service_areas")
@Index(["vendor_id", "area_id"], { unique: true, where: "deleted_at IS NULL" })
export class ServiceArea {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  vendor_id!: string;

  @Column({ type: "uuid" })
  area_id!: string;

  @Column({ type: "integer", default: 0 })
  travel_buffer_minutes!: number;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
