import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

export interface BnplPlan {
  installments: number;
  interval_days: number;
}

@Entity("payment_method_thresholds")
export class PaymentMethodThreshold {
  @PrimaryColumn({ type: "varchar", length: 32 })
  provider!: "tabby" | "tamara" | "cod";

  @Column({ type: "bigint", transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  min_amount_fils!: number;

  @Column({ type: "bigint", transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  max_amount_fils!: number;

  @Column({ type: "jsonb" })
  plans!: BnplPlan[];

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @Column({
    type: "bigint",
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  surcharge_fils!: number | null;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
