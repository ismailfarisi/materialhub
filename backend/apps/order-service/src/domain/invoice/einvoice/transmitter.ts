// transmitter.ts — the seam where an Accredited Service Provider (ASP) plugs
// in. MaterialHub does not connect to any ASP yet; the default transmitter is
// a no-op that leaves invoices `ready` and records why nothing was sent.
//
// To connect an ASP later: implement EInvoiceTransmitter (most ASPs take the
// UBL XML over HTTPS and return a message id, then report delivery or
// rejection asynchronously by webhook), register it in container.ts, and add
// a webhook route that updates tax_invoices.einvoice_status.

export interface EInvoiceSubmission {
  invoiceId: string;
  invoiceNumber: string;
  sellerTrn: string | null;
  buyerTrn: string | null;
  xml: string;
}

export type EInvoiceSubmitResult =
  | { status: "submitted"; messageId: string }
  | { status: "rejected"; error: string }
  | { status: "skipped"; reason: string };

export interface EInvoiceTransmitter {
  readonly name: string;
  submit(submission: EInvoiceSubmission): Promise<EInvoiceSubmitResult>;
}

export class NoopEInvoiceTransmitter implements EInvoiceTransmitter {
  readonly name = "noop";
  async submit(_s: EInvoiceSubmission): Promise<EInvoiceSubmitResult> {
    return {
      status: "skipped",
      reason: "No Accredited Service Provider is configured; the invoice is stored and ready.",
    };
  }
}
