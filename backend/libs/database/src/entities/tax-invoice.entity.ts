import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { EInvoiceStatus, TaxInvoiceKind, TaxInvoicePaymentStatus } from "../enums.ts";

export interface InvoiceParty {
  legal_name: string;
  trade_name?: string | null;
  /** 15-digit UAE TRN, or null (buyer not VAT-registered / unknown). */
  trn: string | null;
  /** Peppol participant ID ("0235:<TIN>"), or null. */
  peppol_id: string | null;
  /** Trade licence or other registration number, when known. */
  registration_id?: string | null;
  registration_issuer?: string | null;
  email?: string | null;
  address: {
    line1: string | null;
    line2?: string | null;
    city: string | null;
    /** Emirate name or code as captured. */
    emirate?: string | null;
    po_box?: string | null;
    country_code: string;
  };
}

export interface InvoiceLine {
  line_no: number;
  /** order_items.id, or a synthetic id for platform charges. */
  source_id: string;
  description: string;
  sku: string | null;
  quantity: number;
  /** UN/ECE Rec 20 unit code. */
  unit_code: string;
  /** VAT-exclusive unit price in fils; may be fractional. */
  unit_price_excl_fils: number;
  /** VAT-exclusive line amount (fils, integer). */
  line_net_fils: number;
  /** VAT category code (UNCL5305): S = standard rate. */
  vat_category: string;
  vat_rate: number;
  /** The VAT-inclusive amount the buyer paid for this line. */
  line_gross_fils: number;
}

export interface InvoiceAllowanceCharge {
  is_charge: boolean;
  reason: string;
  /** VAT-exclusive amount (fils). */
  amount_fils: number;
  vat_category: string;
  vat_rate: number;
}

export interface VatBreakdownRow {
  category: string;
  rate: number;
  taxable_fils: number;
  vat_fils: number;
}

/**
 * A VAT tax invoice: one per vendor sub-order (seller = vendor), plus one
 * platform invoice per order for shipping and surcharges (seller =
 * MaterialHub). This row is the structured, Peppol-ready record; the PDF and
 * the UBL XML are both rendered from it.
 */
@Entity("tax_invoices")
@Index("uq_tax_invoices_vendor_order", ["vendor_order_id"], {
  unique: true,
  where: "vendor_order_id IS NOT NULL",
})
@Index("uq_tax_invoices_platform_order", ["order_id"], {
  unique: true,
  where: "kind = 'platform'",
})
export class TaxInvoice {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 40 })
  invoice_number!: string;

  @Column({ type: "enum", enum: TaxInvoiceKind, enumName: "tax_invoice_kind_enum" })
  kind!: TaxInvoiceKind;

  /** UNCL1001 document type: 380 commercial invoice. */
  @Column({ type: "varchar", length: 3, default: "380" })
  type_code!: string;

  @Index()
  @Column({ type: "uuid" })
  order_id!: string;

  @Column({ type: "uuid", nullable: true })
  vendor_order_id!: string | null;

  /** Seller vendor; null for platform invoices. */
  @Index()
  @Column({ type: "uuid", nullable: true })
  vendor_id!: string | null;

  @Index()
  @Column({ type: "uuid" })
  buyer_user_id!: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  business_account_id!: string | null;

  @Column({ type: "date" })
  issue_date!: string;

  @Column({ type: "date", nullable: true })
  supply_date!: string | null;

  @Column({ type: "date", nullable: true })
  due_date!: string | null;

  @Column({ type: "char", length: 3, default: "AED" })
  currency!: string;

  @Column({ type: "jsonb" })
  seller!: InvoiceParty;

  @Column({ type: "jsonb" })
  buyer!: InvoiceParty;

  @Column({ type: "jsonb" })
  lines!: InvoiceLine[];

  @Column({ type: "jsonb", default: [] })
  allowances_charges!: InvoiceAllowanceCharge[];

  @Column({ type: "jsonb" })
  vat_breakdown!: VatBreakdownRow[];

  /** Sum of line_net_fils. */
  @Column({ type: "integer" })
  line_extension_fils!: number;

  @Column({ type: "integer", default: 0 })
  allowance_total_fils!: number;

  @Column({ type: "integer", default: 0 })
  charge_total_fils!: number;

  @Column({ type: "integer" })
  tax_exclusive_fils!: number;

  @Column({ type: "integer" })
  vat_total_fils!: number;

  @Column({ type: "integer" })
  tax_inclusive_fils!: number;

  /** payable - tax_inclusive (a few fils from VAT-inclusive pricing). */
  @Column({ type: "integer", default: 0 })
  rounding_fils!: number;

  /** What the buyer owes for this invoice (VAT inclusive). */
  @Column({ type: "integer" })
  payable_fils!: number;

  /** immediate | net_30 | net_60 */
  @Column({ type: "varchar", length: 20, default: "immediate" })
  payment_terms!: string;

  /** Order payment method (stripe, cash_on_delivery, tabby, tamara, net_terms). */
  @Column({ type: "varchar", length: 30, nullable: true })
  payment_method!: string | null;

  @Index()
  @Column({
    type: "enum",
    enum: TaxInvoicePaymentStatus,
    enumName: "tax_invoice_payment_status_enum",
    default: TaxInvoicePaymentStatus.unpaid,
  })
  payment_status!: TaxInvoicePaymentStatus;

  @Column({ type: "timestamptz", nullable: true })
  paid_at!: Date | null;

  @Column({
    type: "enum",
    enum: EInvoiceStatus,
    enumName: "einvoice_status_enum",
    default: EInvoiceStatus.ready,
  })
  einvoice_status!: EInvoiceStatus;

  @Column({ type: "varchar", length: 255, nullable: true })
  asp_message_id!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  asp_submitted_at!: Date | null;

  @Column({ type: "text", nullable: true })
  asp_last_error!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  pdf_s3_key!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
