import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

// One-off availability exceptions (vacation, sick). Vendor-wide blackouts still
// inherit vendor_holidays.
@Entity("staff_time_off")
export class StaffTimeOff {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid" })
  staff_member_id!: string;

  @Column({ type: "timestamptz" })
  starts_at!: Date;

  @Column({ type: "timestamptz" })
  ends_at!: Date;

  @Column({ type: "text", nullable: true })
  reason!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
