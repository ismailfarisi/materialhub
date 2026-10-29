import { describe, expect, it } from "bun:test";
import { getMetadataArgsStorage } from "typeorm";
import { AppDataSource } from "../data-source.ts";
import { AffiliateLinkTargetType } from "../enums.ts";
import {
  AffiliateAttribution,
  AffiliateCommission,
  AffiliateLink,
  VendorAffiliate,
} from "./index.ts";

describe("affiliate entity registration", () => {
  it("declares all four @Entity tables", () => {
    const tables = getMetadataArgsStorage().tables.map((t) => t.name);
    expect(tables).toContain("vendor_affiliates");
    expect(tables).toContain("affiliate_links");
    expect(tables).toContain("affiliate_attributions");
    expect(tables).toContain("affiliate_commissions");
  });

  it("registers all four entities in the DataSource entities[] array", () => {
    const entities = AppDataSource.options.entities as unknown[];
    expect(entities).toContain(VendorAffiliate);
    expect(entities).toContain(AffiliateLink);
    expect(entities).toContain(AffiliateAttribution);
    expect(entities).toContain(AffiliateCommission);
  });

  it("supports brand and custom_url targets with target_url column", () => {
    expect(AffiliateLinkTargetType.brand).toBe("brand");
    expect(AffiliateLinkTargetType.custom_url).toBe("custom_url");
    const link = new AffiliateLink();
    link.target_type = AffiliateLinkTargetType.brand;
    link.target_url = "/brand/flormar";
    expect(link.target_url).toBe("/brand/flormar");
  });
});
