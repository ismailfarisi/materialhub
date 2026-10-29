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
import { IntegrationDirection, IntegrationEventType } from "../enums/integration.enums.ts";
import type { VendorIntegration } from "./vendor-integration.entity.ts";

@Entity("vendor_integration_mappings")
@Index("vendor_integration_mappings_uq", ["integration_id", "event_type", "direction"], {
  unique: true,
  where: "deleted_at IS NULL",
})
export class VendorIntegrationMapping {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  integration_id!: string;

  @ManyToOne("VendorIntegration", { onDelete: "CASCADE" })
  @JoinColumn({ name: "integration_id" })
  integration!: VendorIntegration;

  @Column({ type: "enum", enum: IntegrationEventType })
  event_type!: IntegrationEventType;

  @Column({ type: "enum", enum: IntegrationDirection })
  direction!: IntegrationDirection;

  @Column({ type: "jsonb" })
  spec!: Record<string, unknown>;

  @Column({ type: "boolean", default: true })
  is_enabled!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
