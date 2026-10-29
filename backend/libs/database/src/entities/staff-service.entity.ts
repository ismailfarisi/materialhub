import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

// M:N — which offerings a staff member is eligible to perform.
@Entity("staff_services")
@Index(["staff_member_id", "service_offering_id"], { unique: true, where: "deleted_at IS NULL" })
export class StaffService {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  staff_member_id!: string;

  @Column({ type: "uuid" })
  service_offering_id!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
