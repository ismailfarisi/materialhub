import type { TaxRate } from "@materialhub/database";
// tax.service.ts
import type { Repository } from "typeorm";

const DEFAULT_VAT_RATE = 5; // UAE VAT 5%

export class TaxService {
  constructor(private taxRateRepo: Repository<TaxRate>) {}

  async getRate(categoryId?: string, emirate?: string): Promise<number> {
    const now = new Date().toISOString().split("T")[0];
    const rates = await this.taxRateRepo.find({
      where: { country_code: "AE", is_active: true },
      order: { category_id: "ASC" }, // nulls last
    });

    // Priority: category + emirate > category > emirate > default
    const applicable = rates.filter((r) => {
      if (r.effective_from > now!) return false;
      if (r.effective_until && r.effective_until < now!) return false;
      return true;
    });

    const catEmirate = applicable.find(
      (r) => r.category_id === categoryId && r.emirate === emirate,
    );
    if (catEmirate) return Number(catEmirate.rate);

    const catOnly = applicable.find((r) => r.category_id === categoryId && !r.emirate);
    if (catOnly) return Number(catOnly.rate);

    const emirateOnly = applicable.find((r) => !r.category_id && r.emirate === emirate);
    if (emirateOnly) return Number(emirateOnly.rate);

    const defaultRate = applicable.find((r) => r.is_default);
    return defaultRate ? Number(defaultRate.rate) : DEFAULT_VAT_RATE;
  }

  calculateTax(amount: number, rate: number): number {
    return Math.round(amount * (rate / 100));
  }
}
