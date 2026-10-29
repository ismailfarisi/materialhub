import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("vendor_ai_usage")
export class VendorAiUsage {
  @PrimaryColumn({ type: "uuid" })
  vendor_id!: string;

  @PrimaryColumn({ type: "char", length: 7 })
  month!: string;

  @Column({ type: "integer", default: 0 })
  count!: number;
}
