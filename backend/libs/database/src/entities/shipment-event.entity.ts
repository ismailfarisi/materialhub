import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ShipmentStatus } from "../enums.ts";
import type { Shipment } from "./shipment.entity.ts";

@Entity("shipment_events")
export class ShipmentEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  shipment_id!: string;

  @ManyToOne("Shipment", "events")
  @JoinColumn({ name: "shipment_id" })
  shipment!: Shipment;

  @Column({ type: "enum", enum: ShipmentStatus })
  status!: ShipmentStatus;

  @Column({ type: "varchar", length: 255, nullable: true })
  location!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "timestamptz" })
  occurred_at!: Date;

  @Column({ type: "jsonb", nullable: true })
  raw_payload!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  external_event_id!: string | null;

  @Column({ type: "uuid", nullable: true })
  provider_id!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
