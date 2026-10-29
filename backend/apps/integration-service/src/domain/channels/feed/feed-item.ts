/** Channel-agnostic representation of one feed offer. Serializers turn this into
 *  channel-specific XML/CSV in a later phase. Prices are in fils (1 AED = 100 fils). */
export interface FeedItem {
  offer_id: string;
  item_group_id: string | null;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_links: string[];
  availability: "in_stock" | "out_of_stock";
  price_fils: number;
  sale_price_fils: number | null;
  currency: string;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  condition: "new";
  google_product_category: string | null;
  product_type: string | null;
  country_of_origin: string | null;
  identifier_exists: boolean;
}
