import type { TemplateDescriptor } from "@materialhub/bulk-jobs";

export const flashDealDeleteTemplate: TemplateDescriptor = {
  jobType: "flash_deal_delete",
  sheets: [
    {
      name: "Delete",
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
          key: "note",
          label: "Note",
          required: false,
          example: "campaign ended",
          help: "Optional audit annotation, kept in the diff log.",
        },
      ],
    },
  ],
  readme: [
    "One row per SKU you want to clear of flash deals.",
    "Provide either sku OR external_id (external_id wins if both are present).",
    "For each SKU, all currently-running and future-scheduled deals are soft-deleted. Expired deals are left alone.",
    "This operation is idempotent — re-running on the same file does nothing.",
    "Bulk deletes cannot be undone via the UI in v1. If you delete the wrong SKUs, you'll need to re-create their deals manually.",
  ],
};
