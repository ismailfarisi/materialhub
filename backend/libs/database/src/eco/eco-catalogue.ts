/**
 * Eco catalogue definitions (workstream 4: plastic-ban ready packaging).
 *
 * Shared by the seed (which creates the attribute rows and the food-service
 * category subtree) and by product-service (which reads the attribute slugs
 * for the admin review queue and the storefront compliance block).
 *
 * The UAE federal single-use plastics ban (phase 2, from 1 January 2026)
 * covers single-use cups, lids, cutlery, plates, straws, stirrers, foam food
 * containers and single-use bags under 50 microns of any material. These
 * attributes describe a product; they are vendor-supplied data, not a legal
 * determination by MaterialHub.
 */

export type EcoAttributeType = "select" | "multi_select" | "number";
export type EcoFilterInput = "checkbox" | "range";

export interface EcoAttributeValueDef {
  slug: string;
  value: string;
  ar: string;
}

export interface EcoAttributeDef {
  slug: string;
  name: string;
  ar: string;
  type: EcoAttributeType;
  filter_input_type: EcoFilterInput;
  /** Only attach to these category slugs (default: every eco category). */
  onlyCategories?: string[];
  validation?: Record<string, unknown>;
  values: EcoAttributeValueDef[];
}

export const ECO_ATTRIBUTES: EcoAttributeDef[] = [
  {
    slug: "material-composition",
    name: "Material composition",
    ar: "تركيب المادة",
    type: "multi_select",
    filter_input_type: "checkbox",
    values: [
      { slug: "virgin-paper-fibre", value: "Virgin paper fibre", ar: "ألياف ورق جديدة" },
      { slug: "recycled-paper-fibre", value: "Recycled paper fibre", ar: "ألياف ورق معاد تدويرها" },
      { slug: "kraft-paper", value: "Kraft paper", ar: "ورق كرافت" },
      { slug: "paperboard", value: "Paperboard", ar: "كرتون ورقي" },
      {
        slug: "moulded-fibre-bagasse",
        value: "Moulded fibre (bagasse)",
        ar: "ألياف مقولبة (تفل قصب السكر)",
      },
      {
        slug: "moulded-fibre-wood-pulp",
        value: "Moulded fibre (wood pulp)",
        ar: "ألياف مقولبة (لب الخشب)",
      },
      { slug: "wood", value: "Wood", ar: "خشب" },
      { slug: "bamboo", value: "Bamboo", ar: "خيزران" },
      { slug: "water-based-coating", value: "Water-based coating", ar: "طلاء مائي" },
      {
        slug: "pla-lining",
        value: "PLA lining (plant-based plastic)",
        ar: "بطانة PLA (بلاستيك نباتي)",
      },
      { slug: "pe-lining", value: "PE lining (plastic)", ar: "بطانة PE (بلاستيك)" },
    ],
  },
  {
    slug: "recyclable",
    name: "Recyclable",
    ar: "قابل لإعادة التدوير",
    type: "select",
    filter_input_type: "checkbox",
    values: [
      { slug: "yes", value: "Yes", ar: "نعم" },
      { slug: "no", value: "No", ar: "لا" },
    ],
  },
  {
    slug: "compostable",
    name: "Compostable",
    ar: "قابل للتسميد",
    type: "multi_select",
    filter_input_type: "checkbox",
    values: [
      { slug: "home", value: "Home compostable", ar: "قابل للتسميد المنزلي" },
      { slug: "industrial", value: "Industrial compostable", ar: "قابل للتسميد الصناعي" },
      { slug: "not-compostable", value: "Not compostable", ar: "غير قابل للتسميد" },
    ],
  },
  {
    slug: "plastic-free",
    name: "Plastic-free",
    ar: "خالٍ من البلاستيك",
    type: "select",
    filter_input_type: "checkbox",
    values: [
      { slug: "yes", value: "Yes", ar: "نعم" },
      { slug: "no", value: "No", ar: "لا" },
    ],
  },
  {
    slug: "forest-certification",
    name: "Forest certification",
    ar: "شهادة مصدر الغابات",
    type: "multi_select",
    filter_input_type: "checkbox",
    values: [
      { slug: "fsc", value: "FSC", ar: "FSC" },
      { slug: "pefc", value: "PEFC", ar: "PEFC" },
      { slug: "not-certified", value: "Not certified", ar: "غير معتمد" },
    ],
  },
  {
    slug: "bag-thickness-microns",
    name: "Bag thickness (microns)",
    ar: "سماكة الكيس (ميكرون)",
    type: "number",
    filter_input_type: "range",
    onlyCategories: ["paper-bags", "food-service-paper-bags"],
    validation: { min: 1, max: 2000, unit: "µm" },
    values: [],
  },
];

export const ECO_ATTRIBUTE_SLUGS = ECO_ATTRIBUTES.map((a) => a.slug);

/** Ban threshold for single-use bags of any material (microns). */
export const PLASTIC_BAN_BAG_MIN_MICRONS = 50;

export interface EcoCategoryDef {
  slug: string;
  name: string;
  ar: string;
}

/** Food-service paper packaging, a depth-1 child of Boxes & Packaging. */
export const FOOD_SERVICE_PARENT_SLUG = "boxes-packaging";
export const FOOD_SERVICE_CATEGORY: EcoCategoryDef = {
  slug: "food-service-packaging",
  name: "Food-service Paper Packaging",
  ar: "تغليف ورقي للخدمات الغذائية",
};
export const FOOD_SERVICE_CHILDREN: EcoCategoryDef[] = [
  {
    slug: "food-service-paper-bags",
    name: "Paper Bags for Food Service",
    ar: "أكياس ورقية للخدمات الغذائية",
  },
  { slug: "paper-cups-lids", name: "Paper Cups & Lids", ar: "أكواب وأغطية ورقية" },
  {
    slug: "moulded-fibre-containers",
    name: "Moulded-fibre Containers",
    ar: "عبوات من الألياف المقولبة",
  },
  { slug: "wooden-paper-cutlery", name: "Wooden & Paper Cutlery", ar: "أدوات مائدة خشبية وورقية" },
];

/** Packaging categories that carry the compliance attributes. */
export const ECO_ATTRIBUTE_CATEGORY_SLUGS = [
  "boxes-packaging",
  "rigid-boxes",
  "folding-cartons",
  "mailer-boxes",
  "paper-bags",
  "inserts-fillers",
  FOOD_SERVICE_CATEGORY.slug,
  ...FOOD_SERVICE_CHILDREN.map((c) => c.slug),
];

/** CMS-featurable rule collection for the "Plastic-ban ready packaging" landing. */
export const PLASTIC_BAN_COLLECTION_SLUG = "plastic-ban-ready-packaging";
