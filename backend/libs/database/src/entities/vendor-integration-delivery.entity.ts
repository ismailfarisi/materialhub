import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import {
  IntegrationDeliveryStatus,
  IntegrationDirection,
  IntegrationEventType,
} from "../enums/integration.enums.ts";

@Entity("vendor_integration_deliveries")
@Index("vid_integration_created_idx", ["integration_id", "created_at"])
@Index("vid_idempotency_uq", ["idempotency_key", "integration_id"], {
  unique: true,
  where: "idempotency_key IS NOT NULL",
})
export class VendorIntegrationDelivery {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  integration_id!: string;

  @Column({ type: "enum", enum: IntegrationEventType })
  event_type!: IntegrationEventType;

  @Column({ type: "enum", enum: IntegrationDirection })
  direction!: IntegrationDirection;

  @Column({ type: "jsonb", nullable: true })
  source_ref!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  idempotency_key!: string | null;

  @Column({ type: "jsonb", nullable: true })
  request_body!: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  request_headers!: Record<string, unknown> | null;

  @Column({ type: "integer", nullable: true })
  response_status!: number | null;

  @Column({ type: "text", nullable: true })
  response_body!: string | null;

  @Column({ type: "integer", default: 0 })
  latency_ms!: number;

  @Column({ type: "smallint", default: 1 })
  attempt!: number;

  @Column({
    type: "enum",
    enum: IntegrationDeliveryStatus,
    default: IntegrationDeliveryStatus.pending,
  })
  status!: IntegrationDeliveryStatus;

  @Column({ type: "text", nullable: true })
  error_message!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
