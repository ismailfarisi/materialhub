// tax.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { TaxService } from "./tax.service.ts";

describe("TaxService", () => {
  const mockTaxRateRepo = {
    find: mock((_args?: any): Promise<any[]> => Promise.resolve([])),
  };

  let service: TaxService;

  beforeEach(() => {
    mockTaxRateRepo.find.mockClear();
    service = new TaxService(mockTaxRateRepo as any);
  });

  it("returns category-specific rate when available", async () => {
    mockTaxRateRepo.find.mockResolvedValueOnce([
      { rate: 5, category_id: "cat-1", emirate: null, is_default: false, is_active: true },
      { rate: 5, category_id: null, emirate: null, is_default: true, is_active: true },
    ]);
    const rate = await service.getRate("cat-1", "Dubai");
    expect(rate).toBe(5);
  });

  it("falls back to default 5% VAT when no rates configured", async () => {
    mockTaxRateRepo.find.mockResolvedValueOnce([]);
    const rate = await service.getRate("cat-1", "Dubai");
    expect(rate).toBe(5);
  });

  it("calculates tax amount correctly", () => {
    // 5000 fils * 5% = 250 fils
    expect(service.calculateTax(5000, 5)).toBe(250);
  });

  it("rounds tax to nearest fil", () => {
    // 3333 fils * 5% = 166.65 → 167
    expect(service.calculateTax(3333, 5)).toBe(167);
  });
});
