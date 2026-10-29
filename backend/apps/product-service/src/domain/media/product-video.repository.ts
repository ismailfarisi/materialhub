import {
  AppDataSource,
  Product,
  ProductVideo,
  type ProductVideoAssetType,
  type ProductVideoStatus,
} from "@materialhub/database";
import { type FindOptionsWhere, IsNull, Not } from "typeorm";
import type { IProductVideoRepository } from "../types.ts";

/** Tied to the exported union so a typo is a compile error, not a silent no-match. */
const LAYOUT_BACKGROUND: ProductVideoAssetType = "layout_background";
const FAILED: ProductVideoStatus = "failed";

export class ProductVideoRepository implements IProductVideoRepository {
  private get repo() {
    return AppDataSource.getRepository(ProductVideo);
  }

  async findByProductId(productId: string): Promise<ProductVideo[]> {
    return this.repo.find({
      // biome-ignore lint/suspicious/noExplicitAny: TypeORM where + IsNull
      where: { product_id: productId, deleted_at: IsNull() } as any,
      order: { sort_order: "ASC", created_at: "ASC" },
    });
  }

  async findById(id: string): Promise<ProductVideo | null> {
    return this.repo.findOne({
      // biome-ignore lint/suspicious/noExplicitAny: TypeORM where + IsNull
      where: { id, deleted_at: IsNull() } as any,
    });
  }

  async create(data: Partial<ProductVideo>): Promise<ProductVideo> {
    // biome-ignore lint/suspicious/noExplicitAny: TypeORM DeepPartial vs Partial
    const entity = this.repo.create(data as any) as unknown as ProductVideo;
    return this.repo.save(entity);
  }

  async updateFields(id: string, fields: Partial<ProductVideo>): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: TypeORM QueryDeepPartialEntity vs Partial
    await this.repo.update({ id }, fields as any);
  }

  async softRemove(id: string): Promise<void> {
    await this.repo.softDelete({ id });
  }

  async maxSortOrder(productId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder("v")
      .select("COALESCE(MAX(v.sort_order), -1)", "max")
      .where("v.product_id = :pid", { pid: productId })
      .andWhere("v.deleted_at IS NULL")
      .getRawOne<{ max: string }>();
    return Number(row?.max ?? -1);
  }

  async findProductOwner(productId: string): Promise<string | null> {
    const product = await AppDataSource.getRepository(Product).findOne({
      where: { id: productId },
      select: ["id", "vendor_id"],
    });
    return product?.vendor_id ?? null;
  }

  async countLayoutVideosByVendor(vendorId: string): Promise<number> {
    // Failed transcodes are excluded deliberately. Nothing surfaces a failed
    // layout video to the merchant — VideoField drops the id when the poll
    // reports `failed`, and there is no listing UI — so a counted failure is a
    // quota slot the vendor can never reclaim. Ten of them would lock them out
    // permanently. Soft-deleted rows are excluded by TypeORM automatically.
    const where: FindOptionsWhere<ProductVideo> = {
      vendor_id: vendorId,
      asset_type: LAYOUT_BACKGROUND,
      status: Not(FAILED),
    };
    return this.repo.count({ where });
  }

  async findLayoutVideoById(id: string): Promise<ProductVideo | null> {
    const where: FindOptionsWhere<ProductVideo> = { id, asset_type: LAYOUT_BACKGROUND };
    return this.repo.findOne({ where });
  }
}
