import type { TemplateDescriptor } from "@materialhub/bulk-jobs";

export const inventoryUpdateTemplate: TemplateDescriptor = {
  jobType: "inventory_update",
  sheets: [
    {
      name: "Inventory",
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
          help: "Your ERP product/variant code. Overrides sku if both present.",
        },
        {
          key: "quantity_on_hand",
          label: "Quantity on hand",
          required: true,
          example: "42",
          help: "Absolute stock count (not a delta).",
        },
        {
          key: "note",
          label: "Note",
          required: false,
          example: "morning sync",
          help: "Optional annotation, shown in diff log.",
        },
      ],
    },
  ],
  readme: [
    "Fill the Inventory sheet with one row per SKU or external_id.",
    "Provide either sku OR external_id (external_id wins if both are set).",
    "quantity_on_hand is the new absolute stock count, not a delta.",
    "All rows are validated first; if any row fails, nothing is written. Fix the file and re-upload.",
    "Stock updates apply to your default warehouse.",
  ],
};
