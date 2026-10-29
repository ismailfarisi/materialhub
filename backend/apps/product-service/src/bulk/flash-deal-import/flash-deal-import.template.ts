import type { TemplateDescriptor } from "@materialhub/bulk-jobs";

export const flashDealImportTemplate: TemplateDescriptor = {
  jobType: "flash_deal_import",
  sheets: [
    {
      name: "FlashDeals",
      columns: [
        {
          key: "sku",
          label: "SKU",
          required: false,
          example: "TS-RED-M",
          help: "Product or variant SKU. Either sku or external_id is required.",
        },
        {
          key: "external_id",
          label: "External ID",
          required: false,
          example: "",
          help: "Your ERP product/variant code. Wins if both are set.",
        },
        {
          key: "title",
          label: "Title",
          required: true,
          example: "Summer flash sale",
          help: "Display title for the deal.",
        },
        {
          key: "deal_price",
          label: "Deal price (fils)",
          required: true,
          example: "7500",
          help: "Discounted price in fils. Must be lower than original_price.",
        },
        {
          key: "original_price",
          label: "Original price (fils)",
          required: false,
          example: "",
          help: "Leave blank to use the product's current price at upload time.",
        },
        {
          key: "quantity_limit",
          label: "Quantity limit",
          required: false,
          example: "",
          help: "Optional cap on how many units sell at the deal price. Blank = unlimited.",
        },
        {
          key: "starts_at",
          label: "Starts at",
          required: true,
          example: "2026-06-01 09:00",
          help: "Times without an explicit offset are Asia/Dubai.",
        },
        {
          key: "expires_at",
          label: "Expires at",
          required: true,
          example: "2026-06-08 09:00",
          help: "Must be after starts_at.",
        },
        {
          key: "is_active",
          label: "Is active",
          required: false,
          example: "true",
          help: "Default true. Accepts true/false/yes/no/1/0.",
        },
      ],
    },
  ],
  readme: [
    "Provide either sku OR external_id for each row (external_id wins if both are present).",
    "title is required (≤ 255 chars).",
    "deal_price is the discounted price in fils (e.g. 19999 for AED 199.99).",
    "original_price is optional — leave blank and we'll use the product's current price at upload time.",
    "deal_price MUST be lower than original_price. Same-or-higher prices are rejected.",
    "quantity_limit is optional — blank means unlimited.",
    "starts_at and expires_at accept ISO-8601 (2026-05-15T09:00:00+04:00), bare datetimes (2026-05-15 09:00), bare dates (2026-05-15), or Excel date cells. Times without an explicit offset are interpreted as Asia/Dubai (UAE) time.",
    "expires_at must be after starts_at.",
    "is_active defaults to true. Accepts true/false/yes/no/1/0.",
    "This upload is best-effort: rows that fail validation are skipped, and the rest are saved. Download the error report to fix and re-upload only the failed rows.",
    'To undo this entire upload, click "Revert" on the job detail page. Revert is one-click and idempotent.',
  ],
};
