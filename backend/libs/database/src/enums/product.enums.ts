export enum ProductStatus {
  draft = "draft",
  pending_review = "pending_review",
  approved = "approved",
  rejected = "rejected",
  published = "published",
  unpublished = "unpublished",
  archived = "archived",
}

export enum AttributeType {
  text = "text",
  number = "number",
  boolean = "boolean",
  select = "select",
  multi_select = "multi_select",
  color = "color",
  date = "date",
}

export enum AttributeFilterInputType {
  checkbox = "checkbox",
  color_swatch = "color_swatch",
  radio = "radio",
  range = "range",
  toggle = "toggle",
}

export enum RelationType {
  related = "related",
  cross_sell = "cross_sell",
  upsell = "upsell",
  frequently_bought_together = "frequently_bought_together",
}

export enum ProductGroupListingMode {
  collapsed = "collapsed",
  individual = "individual",
}

export enum ReservationStatus {
  active = "active",
  committed = "committed",
  released = "released",
  expired = "expired",
}

export enum ReviewStatus {
  pending = "pending",
  approved = "approved",
  rejected = "rejected",
  flagged = "flagged",
}

/**
 * Moderation state of a brand.
 *
 * Brands an admin creates are `approved` on insert. `pending` exists for brands
 * a vendor submitted because the catalogue was missing one they sell: the row
 * is real from the moment it is submitted, so the vendor can attach it to
 * products immediately, but every public reader filters on `approved`.
 */
export enum BrandStatus {
  pending = "pending",
  approved = "approved",
  rejected = "rejected",
}

/**
 * Review state of a vendor's "plastic-ban ready" declaration on a product
 * (eco catalogue). Only `approved` declarations surface on the storefront and
 * in the `plastic_ban_ready` search facet.
 */
export enum EcoDeclarationStatus {
  pending = "pending",
  approved = "approved",
  rejected = "rejected",
  withdrawn = "withdrawn",
}

/**
 * What one unit of a listing buys. Prices, minimum order quantities, order
 * increments and price tiers are all counted in this unit ("AED 4.80 / sheet").
 */
export enum UnitOfMeasure {
  sheet = "sheet",
  roll = "roll",
  metre = "metre",
  pack = "pack",
  carton = "carton",
  box = "box",
  piece = "piece",
  kg = "kg",
}

export const UNITS_OF_MEASURE: readonly UnitOfMeasure[] = Object.values(UnitOfMeasure);
