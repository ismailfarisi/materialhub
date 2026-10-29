import { AppDataSource, Product, ProductImage } from "@materialhub/database";
import { IsNull } from "typeorm";
import type { IProductImageRepository } from "../types.ts";

export class ProductImageRepository implements IProductImageRepository {
  private get repo() {
    return AppDataSource.getRepository(ProductImage);
  }

  async findByProductId(productId: string): Promise<ProductImage[]> {
    return this.repo.find({
      // biome-ignore lint/suspicious/noExplicitAny: TypeORM where clause with IsNull() requires cast
      where: { product_id: productId, deleted_at: IsNull() } as any,
      order: { sort_order: "ASC", created_at: "ASC" },
    });
  }

  async findById(id: string): Promise<ProductImage | null> {
    return this.repo.findOne({
      // biome-ignore lint/suspicious/noExplicitAny: TypeORM where clause with IsNull() requires cast
      where: { id, deleted_at: IsNull() } as any,
    });
  }

  async save(data: Partial<ProductImage>): Promise<ProductImage> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async softRemove(image: ProductImage): Promise<ProductImage> {
    return this.repo.softRemove(image);
  }

  async findProductOwner(productId: string): Promise<string | null> {
    const product = await AppDataSource.getRepository(Product).findOne({
      where: { id: productId },
      select: ["id", "vendor_id"],
    });
    return product?.vendor_id ?? null;
  }

  async findByIdIncludingDeleted(id: string): Promise<ProductImage | null> {
    return this.repo.findOne({ where: { id }, withDeleted: true });
  }

  async updateFields(
    id: string,
    fields: Partial<
      Pick<
        ProductImage,
        | "alt_text"
        | "focal_x"
        | "focal_y"
        | "variant_id"
        | "url"
        | "thumbnail_url"
        | "card_url"
        | "medium_url"
        | "width"
        | "height"
        | "file_size"
        | "deleted_at"
        | "ai_source_image_id"
        | "sort_order"
        | "is_primary"
      >
    >,
  ): Promise<void> {
    await this.repo.update({ id }, fields);
  }

  async hardDelete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  async findCandidatesByOriginalId(originalId: string): Promise<ProductImage[]> {
    return this.repo.find({
      where: { ai_source_image_id: originalId },
      withDeleted: true,
    });
  }
}
