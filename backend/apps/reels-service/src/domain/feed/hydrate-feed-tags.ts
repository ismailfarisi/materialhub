import { AppDataSource, ProductImage, type Reel, ReelProductTag } from "@materialhub/database";
import { In } from "typeorm";

// Bare Reel rows from the feed don't carry tags (or product images), so the
// storefront can't render the chip thumbnail or price. Hydrate both in two
// pooled queries (one for tags+product, one for primary images).
export async function hydrateFeedReelTags(reels: Reel[]): Promise<void> {
  if (reels.length === 0) return;
  const reelIds = reels.map((r) => r.id);
  const tags = await AppDataSource.getRepository(ReelProductTag).find({
    where: { reel_id: In(reelIds) },
    relations: ["product"],
  });
  if (tags.length === 0) {
    for (const r of reels) (r as Reel & { tags: ReelProductTag[] }).tags = [];
    return;
  }

  const productIds = Array.from(
    new Set(
      tags
        .map((t) => t.product?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const images =
    productIds.length > 0
      ? await AppDataSource.getRepository(ProductImage).find({
          where: { product_id: In(productIds) },
          order: { is_primary: "DESC", sort_order: "ASC" },
        })
      : [];
  const imgByProduct = new Map<string, ProductImage>();
  for (const img of images) {
    if (!imgByProduct.has(img.product_id)) imgByProduct.set(img.product_id, img);
  }
  for (const tag of tags) {
    const product = tag.product as
      | (ReelProductTag["product"] & { primary_image_url?: string | null })
      | undefined;
    if (!product?.id) continue;
    const img = imgByProduct.get(product.id);
    if (img) product.primary_image_url = img.medium_url ?? img.url;
  }

  const tagsByReel = new Map<string, ReelProductTag[]>();
  for (const tag of tags) {
    const list = tagsByReel.get(tag.reel_id) ?? [];
    list.push(tag);
    tagsByReel.set(tag.reel_id, list);
  }
  for (const reel of reels) {
    (reel as Reel & { tags: ReelProductTag[] }).tags = tagsByReel.get(reel.id) ?? [];
  }
}
