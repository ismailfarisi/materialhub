import type { TemplateDescriptor } from "@materialhub/bulk-jobs";

export const catalogImportTemplate: TemplateDescriptor = {
  jobType: "catalog_import",
  sheets: [
    {
      name: "Products",
      columns: [
        {
          key: "external_id",
          label: "External ID",
          required: false,
          example: "ERP-1001",
        },
        { key: "sku", label: "SKU", required: false, example: "DIO-SAU-001" },
        {
          key: "name",
          label: "Name",
          required: true,
          example: "Dior Sauvage Eau de Parfum",
        },
        {
          key: "slug",
          label: "Slug",
          required: false,
          example: "dior-sauvage-eau-de-parfum",
        },
        {
          key: "short_description",
          label: "Short description",
          required: false,
          example: "Woody aromatic EDP — bergamot, ambroxan, vetiver.",
        },
        {
          key: "description",
          label: "Description",
          required: false,
          example: "Masculine woody aromatic fragrance with bergamot and ambroxan.",
        },
        {
          key: "ingredients",
          label: "Ingredients",
          required: false,
          example: "Alcohol Denat., Parfum (Fragrance), Aqua (Water), Limonene, Linalool.",
        },
        {
          key: "usage_instruction",
          label: "Usage instructions",
          required: false,
          example: "Spray on pulse points — wrists, neck, behind ears. Avoid eye contact.",
        },
        {
          key: "category_slug",
          label: "Category slug",
          required: true,
          example: "womens-fragrance",
          help: "Use a valid leaf category slug from the catalog, such as 'womens-fragrance', 'arabian-perfumery', 'skincare', or 'makeup'.",
        },
        {
          key: "brand_slug",
          label: "Brand slug",
          required: false,
          example: "dior",
          help: "Use a valid brand slug if available, such as 'dior', 'chanel', 'estee-lauder', or 'huda-beauty'.",
        },
        {
          key: "status",
          label: "Status",
          required: false,
          example: "draft",
          xlsxValidation: {
            type: "list",
            formulae: ['"draft,pending_review,active,archived"'],
          },
        },
        {
          key: "price",
          label: "Price (fils)",
          required: true,
          example: "9900",
        },
        {
          key: "compare_at_price",
          label: "Compare-at price (fils)",
          required: false,
          example: "",
        },
        {
          key: "cost_price",
          label: "Cost price (fils)",
          required: false,
          example: "",
        },
        { key: "currency", label: "Currency", required: false, example: "AED" },
        {
          key: "has_variants",
          label: "Has variants",
          required: false,
          example: "false",
          xlsxValidation: { type: "list", formulae: ['"true,false"'] },
        },
        {
          key: "track_inventory",
          label: "Track inventory",
          required: false,
          example: "true",
        },
        {
          key: "allow_backorder",
          label: "Allow backorder",
          required: false,
          example: "false",
        },
        {
          key: "requires_shipping",
          label: "Requires shipping",
          required: false,
          example: "true",
        },
        {
          key: "weight_grams",
          label: "Weight (g)",
          required: false,
          example: "180",
        },
        { key: "barcode", label: "Barcode", required: false, example: "" },
        { key: "mpn", label: "MPN", required: false, example: "" },
        {
          key: "tags",
          label: "Tags (pipe-sep)",
          required: false,
          example: "premium|eco-friendly|bulk",
        },
        {
          key: "meta_title",
          label: "Meta title",
          required: false,
          example: "Dior Sauvage EDP | MaterialHub",
        },
        {
          key: "meta_description",
          label: "Meta description",
          required: false,
          example: "",
        },
        {
          key: "meta_keywords",
          label: "Meta keywords",
          required: false,
          example: "",
        },
        {
          key: "image_urls",
          label: "Image URLs (pipe-sep)",
          required: false,
          example: "https://cdn.example.com/img1.jpg|https://cdn.example.com/img2.jpg",
        },
        {
          key: "initial_quantity",
          label: "Initial qty (simple products only)",
          required: false,
          example: "100",
        },
        {
          key: "group_name",
          label: "group_name",
          required: false,
          example: "Velvet Lipstick",
          help: "Optional. Rows sharing the same group_name become one color/shade family. Leave blank for standalone products.",
        },
        {
          key: "group_attribute",
          label: "group_attribute",
          required: false,
          example: "color",
          help: "Required when group_name is set. The slug of the grouping attribute (must be a groupable select/color attribute, e.g. 'color'). The shade comes from this row's attr.<slug> value.",
        },
        {
          key: "attr.gender",
          label: "attr.gender",
          required: false,
          example: "men",
          help: "Prefix any non-variant attribute column with attr. — value is the attribute_value slug, such as 'men', 'women', or 'unisex'.",
        },
        {
          key: "attr.fragrance-concentration",
          label: "attr.fragrance-concentration",
          required: false,
          example: "edp",
        },
      ],
    },
    {
      name: "Variants",
      columns: [
        {
          key: "product_external_id",
          label: "Parent external ID",
          required: false,
          example: "ERP-1001",
        },
        {
          key: "product_sku",
          label: "Parent SKU",
          required: false,
          example: "TS-RED-PARENT",
        },
        {
          key: "variant_external_id",
          label: "Variant external ID",
          required: false,
          example: "ERP-1001-RED-M",
        },
        {
          key: "variant_sku",
          label: "Variant SKU",
          required: false,
          example: "TS-RED-M",
        },
        { key: "name", label: "Name", required: false, example: "Red / M" },
        {
          key: "option.shade",
          label: "option.shade",
          required: false,
          example: "fair",
          help: "Prefix variant-defining attribute columns with option. — value is attribute_value slug, such as 'fair', 'medium', or 'deep'.",
        },
        {
          key: "option.size",
          label: "option.size",
          required: false,
          example: "100ml",
          help: "Use exact variant size slugs such as '15ml', '30ml', '50ml', '100ml', '200ml', or '1l'.",
        },
        {
          key: "price",
          label: "Price (fils)",
          required: false,
          example: "9900",
        },
        {
          key: "compare_at_price",
          label: "Compare-at price (fils)",
          required: false,
          example: "",
        },
        {
          key: "cost_price",
          label: "Cost price (fils)",
          required: false,
          example: "",
        },
        {
          key: "weight_grams",
          label: "Weight (g)",
          required: false,
          example: "180",
        },
        {
          key: "length_cm",
          label: "Length (cm)",
          required: false,
          example: "",
        },
        { key: "width_cm", label: "Width (cm)", required: false, example: "" },
        {
          key: "height_cm",
          label: "Height (cm)",
          required: false,
          example: "",
        },
        { key: "barcode", label: "Barcode", required: false, example: "" },
        {
          key: "is_active",
          label: "Is active",
          required: false,
          example: "true",
        },
        {
          key: "sort_order",
          label: "Sort order",
          required: false,
          example: "0",
        },
        {
          key: "initial_quantity",
          label: "Initial qty",
          required: false,
          example: "25",
        },
        {
          key: "image_urls",
          label: "Image URLs (pipe-sep)",
          required: false,
          example: "",
        },
      ],
    },
  ],
  readme: [
    "Catalog import: upload products + variants + inventory seed + attributes + image URLs.",
    "Strictness: best-effort. Invalid rows are skipped; valid rows are imported. Download the error report after the job completes to see skipped rows.",
    "Upsert key: external_id (preferred) or sku (scoped per vendor). If both present, external_id wins.",
    "Variants sheet references products via product_external_id OR product_sku.",
    "Categories: Use category_slug column with valid category slugs (e.g., 'mens-fragrance', 'womens-fragrance', 'skincare', 'makeup'). Categories are hierarchical - use leaf categories (depth 2-3).",
    "Brands: Use brand_slug column with valid brand slugs (e.g., 'dior', 'chanel', 'estee-lauder', 'huda-beauty'). Leave blank for unbranded products.",
    "Example 1: mens fragrance product with category_slug='womens-fragrance', brand_slug='dior', attr.gender='men', attr.fragrance-concentration='edp'.",
    "Example 2: skincare product with category_slug='skincare', brand_slug='estee-lauder', attr.skin-type='dry', attr.formulation='serum'.",
    "Variant options: option.shade can be 'fair', 'medium', 'deep'; option.size can be '15ml', '30ml', '50ml', '100ml', '200ml', or '1l'.",
    "Non-variant attributes: attr.gender, attr.skin-type, attr.formulation, attr.fragrance-concentration are all valid slugs in the beauty catalog. For free-text ingredients/usage/short description, use the dedicated ingredients, usage_instruction, and short_description columns.",
    "Attributes: Use attr.<slug> columns for non-variant attributes and option.<slug> for variant-defining ones. Value must be the attribute_value slug (case-insensitive).",
    "Images: Put pipe-separated URLs in image_urls. Both per-file URLs (https, Drive /file/d/...) and Google Drive folder URLs (https://drive.google.com/drive/folders/...) are supported. Drive folders must be shared 'Anyone with the link can view'; files are imported in alphabetical filename order (use 01-, 02- prefixes for explicit ordering). postimg.cc gallery URLs (https://postimg.cc/gallery/...) are also supported and expand into every image in the gallery, in gallery display order; direct https://i.postimg.cc/... links also work. Products land immediately; images process asynchronously.",
    "Pricing: All prices in fils (smallest currency unit). AED=100 fils, USD=100 cents. Use compare_at_price for sale pricing.",
    "Inventory: For products with variants, leave initial_quantity on Products sheet blank — set it per variant on Variants sheet.",
    "Required fields: name, category_slug, price. All others are optional but recommended for complete product data.",
  ],
};

export interface CatalogTemplateAttributeValue {
  slug: string;
  value: string;
}

export interface CatalogTemplateAttribute {
  slug: string;
  name: string;
  isRequired: boolean;
  isVariant: boolean;
  values: CatalogTemplateAttributeValue[];
}

export interface CatalogTemplateCategory {
  categorySlug: string;
  categoryName: string;
  attributes: CatalogTemplateAttribute[];
}

export interface CatalogTemplateCategoryRow {
  id: string;
  parentId: string | null;
  categorySlug: string;
  categoryName: string;
}

export interface CatalogTemplateCategoryAttributeRow extends CatalogTemplateAttribute {
  categoryId: string;
}

export function buildCatalogTemplateCategoriesFromRows(args: {
  selectedCategories: CatalogTemplateCategoryRow[];
  allCategories: CatalogTemplateCategoryRow[];
  categoryAttributes: CatalogTemplateCategoryAttributeRow[];
}): CatalogTemplateCategory[] {
  const categoriesById = new Map(args.allCategories.map((category) => [category.id, category]));

  function lineageIds(category: CatalogTemplateCategoryRow) {
    const ids = new Set<string>();
    let cursor: CatalogTemplateCategoryRow | undefined = category;
    while (cursor) {
      ids.add(cursor.id);
      cursor = cursor.parentId ? categoriesById.get(cursor.parentId) : undefined;
    }
    return ids;
  }

  return args.selectedCategories.map((category) => {
    const applicableCategoryIds = lineageIds(category);
    const attributesBySlug = new Map<string, CatalogTemplateAttribute>();

    for (const row of args.categoryAttributes) {
      if (!applicableCategoryIds.has(row.categoryId)) continue;
      const prior = attributesBySlug.get(row.slug);
      attributesBySlug.set(row.slug, {
        slug: row.slug,
        name: row.name,
        isRequired: (prior?.isRequired ?? false) || row.isRequired,
        isVariant: row.isVariant,
        values: prior?.values ?? row.values,
      });
    }

    return {
      categorySlug: category.categorySlug,
      categoryName: category.categoryName,
      attributes: [...attributesBySlug.values()],
    };
  });
}

function listFormula(values: CatalogTemplateAttributeValue[]) {
  const slugs = values.map((value) => value.slug).filter(Boolean);
  if (slugs.length === 0) return undefined;
  const formula = `"${slugs.join(",")}"`;
  return formula.length <= 255
    ? { type: "list" as const, allowBlank: true, formulae: [formula] }
    : undefined;
}

function attributeHelp(attribute: CatalogTemplateAttribute, categorySlugs: string[]) {
  const usageText = `Used by: ${categorySlugs.join(", ")}. `;
  const valueText =
    attribute.values.length > 0
      ? `Allowed values: ${attribute.values.map((value) => value.slug).join(", ")}.`
      : "Free text value.";
  return `${usageText}${valueText}`;
}

function exampleFor(attribute: CatalogTemplateAttribute) {
  return attribute.values[0]?.slug ?? "";
}

export function buildCatalogImportTemplateForCategories(
  categories: CatalogTemplateCategory[],
): TemplateDescriptor {
  if (categories.length === 0) return catalogImportTemplate;

  const productAttrCategories = new Map<string, { used: Set<string>; required: Set<string> }>();
  const variantAttrCategories = new Map<string, { used: Set<string>; required: Set<string> }>();
  const attrsBySlug = new Map<string, CatalogTemplateAttribute>();

  for (const category of categories) {
    for (const attribute of category.attributes) {
      const slug = attribute.slug.trim().toLowerCase();
      if (!slug) continue;
      attrsBySlug.set(slug, {
        ...attribute,
        slug,
        isRequired: (attrsBySlug.get(slug)?.isRequired ?? false) || attribute.isRequired,
      });
      const map = attribute.isVariant ? variantAttrCategories : productAttrCategories;
      const categorySet = map.get(slug) ?? {
        used: new Set<string>(),
        required: new Set<string>(),
      };
      categorySet.used.add(category.categorySlug);
      if (attribute.isRequired) categorySet.required.add(category.categorySlug);
      map.set(slug, categorySet);
    }
  }

  const sheets = catalogImportTemplate.sheets.map((sheet) => ({
    ...sheet,
    columns: sheet.columns.filter(
      (column) => !column.key.startsWith("attr.") && !column.key.startsWith("option."),
    ),
  }));
  const productsSheet = sheets.find((sheet) => sheet.name === "Products");
  const variantsSheet = sheets.find((sheet) => sheet.name === "Variants");

  for (const [slug, categorySet] of [...productAttrCategories.entries()].sort()) {
    const attribute = attrsBySlug.get(slug);
    if (!attribute) continue;
    productsSheet?.columns.push({
      key: `attr.${slug}`,
      label: `attr.${slug}`,
      required: false,
      example: exampleFor(attribute),
      help: attributeHelp(attribute, [...categorySet.used]),
      xlsxValidation: listFormula(attribute.values),
    });
  }

  for (const [slug, categorySet] of [...variantAttrCategories.entries()].sort()) {
    const attribute = attrsBySlug.get(slug);
    if (!attribute) continue;
    variantsSheet?.columns.push({
      key: `option.${slug}`,
      label: `option.${slug}`,
      required: false,
      example: exampleFor(attribute),
      help: attributeHelp(attribute, [...categorySet.used]),
      xlsxValidation: listFormula(attribute.values),
    });
  }

  sheets.push({
    name: "Attribute Guide",
    columns: [
      {
        key: "category_slug",
        label: "Category slug",
        required: true,
        example: categories[0]?.categorySlug ?? "",
      },
      {
        key: "category_name",
        label: "Category name",
        required: false,
        example: categories[0]?.categoryName ?? "",
      },
      {
        key: "column_key",
        label: "Column key",
        required: true,
        example: categories[0]?.attributes[0]
          ? `${categories[0].attributes[0].isVariant ? "option" : "attr"}.${categories[0].attributes[0].slug}`
          : "",
      },
      {
        key: "required",
        label: "Required",
        required: true,
        example: "no",
      },
      {
        key: "allowed_values",
        label: "Allowed values",
        required: false,
        example: categories[0]?.attributes[0]?.values.map((value) => value.slug).join("|") ?? "",
      },
      {
        key: "example",
        label: "Example",
        required: false,
        example: categories[0]?.attributes[0] ? exampleFor(categories[0].attributes[0]) : "",
      },
    ],
    exampleRows: categories.flatMap((category) =>
      category.attributes.map((attribute) => [
        category.categorySlug,
        category.categoryName,
        `${attribute.isVariant ? "option" : "attr"}.${attribute.slug}`,
        "no",
        attribute.values.map((value) => value.slug).join("|"),
        exampleFor(attribute),
      ]),
    ),
  });

  return {
    ...catalogImportTemplate,
    sheets,
    readme: [
      ...catalogImportTemplate.readme,
      `Selected categories: ${categories.map((category) => category.categorySlug).join(", ")}`,
      "This template only includes optional attribute columns for the selected categories. Use the Attribute Guide sheet for allowed values.",
    ],
  };
}
