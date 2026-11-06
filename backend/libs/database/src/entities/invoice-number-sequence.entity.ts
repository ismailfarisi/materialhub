import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Gap-free invoice numbering per seller and year. A number is taken with
 * `INSERT ... ON CONFLICT (series) DO UPDATE SET last_value = last_value + 1
 * RETURNING`, inside the same transaction that inserts the invoice, so a
 * rolled-back invoice does not burn a number.
 */
@Entity("invoice_number_sequences")
export class InvoiceNumberSequence {
  /** "<seller key>:<yyyy>", e.g. "vendor:<uuid>:2026" or "platform:2026". */
  @PrimaryColumn({ type: "varchar", length: 80 })
  series!: string;

  /** The last number issued in this series. */
  @Column({ type: "bigint", default: 0 })
  last_value!: string;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
