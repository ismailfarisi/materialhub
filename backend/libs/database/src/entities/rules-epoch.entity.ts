import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("rules_epoch")
export class RulesEpoch {
  @PrimaryColumn({ type: "smallint" })
  id!: 1;

  @Column({ type: "bigint", transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  epoch!: number;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
