import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Public holidays the delivery estimate skips, edited by admins. Islamic
 * holidays follow the moon sighting, so seeded dates are marked
 * `is_estimate` until the UAE government confirms them.
 */
@Entity("public_holidays")
@Index("uq_public_holidays_country_date", ["country_code", "holiday_date"], { unique: true })
export class PublicHoliday {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Calendar date in Asia/Dubai, "YYYY-MM-DD".
  @Column({ type: "date" })
  holiday_date!: string;

  @Column({ type: "varchar", length: 150 })
  name!: string;

  @Column({ type: "varchar", length: 150, nullable: true })
  name_ar!: string | null;

  @Column({ type: "char", length: 2, default: "AE" })
  country_code!: string;

  @Column({ type: "boolean", default: true })
  is_estimate!: boolean;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
