import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("audit_log")
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  actor_id!: string | null;

  @Column({ type: "varchar", length: 50 })
  actor_role!: string;

  @Column({ type: "varchar", length: 100 })
  action!: string;

  @Column({ type: "varchar", length: 100 })
  entity_type!: string;

  @Column({ type: "uuid", nullable: true })
  entity_id!: string | null;

  @Column({ type: "jsonb", nullable: true })
  changes!: Record<string, unknown> | null;

  @Column({ type: "varchar", length: 45, nullable: true })
  ip_address!: string | null;

  @Column({ type: "varchar", length: 512, nullable: true })
  user_agent!: string | null;

  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
