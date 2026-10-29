import type { PaymentInstrumentsService } from "./payment-instruments.service.ts";
import type { QuoteService } from "./quote.service.ts";

export class QuoteController {
  constructor(
    private quoteService: QuoteService,
    private instrumentsService: PaymentInstrumentsService,
  ) {}

  async getQuote(userId: string, addressId: string | null) {
    return this.quoteService.buildQuote({ userId, addressId });
  }

  async getInstruments(userId: string) {
    const instruments = await this.instrumentsService.listForUser(userId);
    return { schema_version: 1 as const, instruments };
  }
}
