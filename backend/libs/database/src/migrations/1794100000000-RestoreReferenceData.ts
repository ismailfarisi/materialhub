import type { MigrationInterface, QueryRunner } from "typeorm";
import { applyReferenceData } from "../reference-data/reference-data.ts";

/**
 * Restores the reference rows the pre-squash migrations inserted and the
 * squashed InitialSchema left out, for every feature that still exists:
 *
 * - `role_permissions`: the default vendor role matrix. Without it every
 *   vendorMembership(...) route 403s, owners included.
 * - `payment_method_thresholds`: Tabby, Tamara and COD (COD checkout fails
 *   without its row).
 * - `sales_channels`: google_merchant, meta_catalog, tiktok (disabled).
 * - `section_types` and the published `vendor-default` storefront template
 *   (`page_layouts` + `layout_versions` + `layout_sections`) that vendor
 *   storefront init clones. The template needs a super_admin to own it, so on
 *   an empty database it is skipped here and created by the seed.
 * - `shipping_rates`: the platform default standard rate.
 * - `shipping_contribution_tiers`: the platform vendor-contribution bands.
 * - `site_settings`: integration switches and retention, AI image enhance,
 *   base carrier cost, order ops inbox, Slack relay, payout settlement window.
 *
 * Strictly insert-if-missing (see `reference-data.ts`): existing rows,
 * admin-edited or soft-deleted, are left alone, and a vendor role an admin has
 * customised keeps its permissions (owner is only topped up to the full set).
 * Data from removed domains (reels, flash deals, beauty tips, ...) is not
 * restored.
 */
export class RestoreReferenceData1794100000000 implements MigrationInterface {
  name = "RestoreReferenceData1794100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await applyReferenceData(queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally a no-op. These rows are reference data that admins edit
    // after the fact (permission matrix, thresholds, channel credentials,
    // layouts, shipping bands, settings), and some may have existed before this
    // migration ran; deleting them on revert could remove live configuration.
  }
}
