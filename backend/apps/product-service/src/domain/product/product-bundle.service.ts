import { AppDataSource, BundleItem, ProductBundle } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

export class ProductBundleService {
  private get bundleRepo() {
    return AppDataSource.getRepository(ProductBundle);
  }
  private get itemRepo() {
    return AppDataSource.getRepository(BundleItem);
  }

  async create(
    productId: string,
    data: {
      name: string;
      bundle_price: number;
      discount_percentage?: number;
      items: Array<{ product_id: string; variant_id?: string; quantity: number }>;
    },
  ) {
    return AppDataSource.transaction(async (manager) => {
      const bundle = await manager.save(
        ProductBundle,
        manager.create(ProductBundle, {
          product_id: productId,
          name: data.name,
          bundle_price: data.bundle_price,
          discount_percentage: data.discount_percentage ?? null,
          is_active: true,
        }),
      );

      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i]!;
        await manager.save(
          BundleItem,
          manager.create(BundleItem, {
            bundle_id: bundle.id,
            product_id: item.product_id,
            variant_id: item.variant_id ?? null,
            quantity: item.quantity,
            sort_order: i,
          }),
        );
      }

      return bundle;
    });
  }

  async update(
    productId: string,
    data: Partial<{
      name: string;
      bundle_price: number;
      discount_percentage: number;
      is_active: boolean;
    }>,
  ) {
    const bundle = await this.bundleRepo.findOne({ where: { product_id: productId } });
    if (!bundle) throw new HttpError(404, "Bundle not found", "BUNDLE_NOT_FOUND");
    Object.assign(bundle, data);
    return this.bundleRepo.save(bundle);
  }

  async remove(productId: string) {
    const bundle = await this.bundleRepo.findOne({ where: { product_id: productId } });
    if (!bundle) throw new HttpError(404, "Bundle not found", "BUNDLE_NOT_FOUND");
    await this.bundleRepo.softRemove(bundle);
  }
}
