import { AppDataSource, ProductRelation } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

export class ProductRelationService {
  private get repo() {
    return AppDataSource.getRepository(ProductRelation);
  }

  async add(productId: string, relatedProductId: string, type: string, sortOrder = 0) {
    return this.repo.save(
      this.repo.create({
        product_id: productId,
        related_product_id: relatedProductId,
        type: type as any,
        sort_order: sortOrder,
      }),
    );
  }

  async remove(productId: string, relationId: string) {
    const relation = await this.repo.findOne({ where: { id: relationId, product_id: productId } });
    if (!relation) throw new HttpError(404, "Relation not found", "RELATION_NOT_FOUND");
    await this.repo.remove(relation);
  }
}
