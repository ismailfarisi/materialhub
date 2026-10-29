import type { ProductImage, ProductVideo } from "@materialhub/database";

export interface IProductImageRepository {
  findByProductId(productId: string): Promise<ProductImage[]>;
  findById(id: string): Promise<ProductImage | null>;
  save(data: Partial<ProductImage>): Promise<ProductImage>;
  softRemove(image: ProductImage): Promise<ProductImage>;
  findProductOwner(productId: string): Promise<string | null>;
  findByIdIncludingDeleted(id: string): Promise<ProductImage | null>;
  updateFields(
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
  ): Promise<void>;
  hardDelete(id: string): Promise<void>;
  findCandidatesByOriginalId(originalId: string): Promise<ProductImage[]>;
}

export interface IProductVideoRepository {
  findByProductId(productId: string): Promise<ProductVideo[]>;
  findById(id: string): Promise<ProductVideo | null>;
  create(data: Partial<ProductVideo>): Promise<ProductVideo>;
  updateFields(id: string, fields: Partial<ProductVideo>): Promise<void>;
  softRemove(id: string): Promise<void>;
  maxSortOrder(productId: string): Promise<number>;
  findProductOwner(productId: string): Promise<string | null>;
  countLayoutVideosByVendor(vendorId: string): Promise<number>;
  findLayoutVideoById(id: string): Promise<ProductVideo | null>;
}

export type { ProductVideoStatus } from "@materialhub/database";
