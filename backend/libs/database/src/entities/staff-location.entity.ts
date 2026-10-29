import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

// M:N — which branches a staff member works at.
@Entity("staff_locations")
@Index(["staff_member_id", "vendor_location_id"], { unique: true, where: "deleted_at IS NULL" })
export class StaffLocation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  staff_member_id!: string;

  @Column({ type: "uuid" })
  vendor_location_id!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
