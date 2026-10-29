import { AppDataSource, Product, ProductRelation, RecentlyViewed } from "@materialhub/database";
import { Not } from "typeorm";

export class RecommendationService {
  private get productRepo() {
    return AppDataSource.getRepository(Product);
  }
  private get recentlyViewedRepo() {
    return AppDataSource.getRepository(RecentlyViewed);
  }
  private get relationRepo() {
    return AppDataSource.getRepository(ProductRelation);
  }

  async youMightAlsoLike(productId: string, limit = 4): Promise<Product[]> {
    const relations = await this.relationRepo.find({
      where: [{ product_id: productId }],
      relations: ["relatedProduct", "relatedProduct.images"],
      order: { sort_order: "ASC" },
      take: limit,
    });

    const filteredRelations = relations.filter((r) => r.relatedProduct);

    if (filteredRelations.length >= limit) {
      return filteredRelations.map((r) => r.relatedProduct);
    }

    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) return [];

    const priceMin = Math.floor(product.price * 0.5);
    const priceMax = Math.ceil(product.price * 1.5);
    const existingIds = relations.map((r) => r.related_product_id);
    existingIds.push(productId);

    const qb = this.productRepo
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.images", "img")
      .where("p.category_id = :categoryId", { categoryId: product.category_id })
      .andWhere("p.id NOT IN (:...excludeIds)", { excludeIds: existingIds })
      .andWhere("p.status = :status", { status: "published" })
      .andWhere("p.price BETWEEN :priceMin AND :priceMax", { priceMin, priceMax })
      .andWhere("p.deleted_at IS NULL")
      .orderBy("p.sales_count", "DESC")
      .take(limit - filteredRelations.length);

    const fallback = await qb.getMany();
    return [...filteredRelations.map((r) => r.relatedProduct), ...fallback];
  }

  async forUser(userId: string, limit = 12): Promise<Product[]> {
    const topCategories = await this.recentlyViewedRepo
      .createQueryBuilder("rv")
      .innerJoin("rv.product", "p")
      .select("p.category_id", "category_id")
      .addSelect("COUNT(*)", "view_count")
      .where("rv.user_id = :userId", { userId })
      .groupBy("p.category_id")
      .orderBy("view_count", "DESC")
      .limit(5)
      .getRawMany();

    if (topCategories.length === 0) {
      return this.productRepo.find({
        where: { status: "published" as any },
        relations: ["images"],
        order: { sales_count: "DESC" },
        take: limit,
      });
    }

    const categoryIds = topCategories.map((c: any) => c.category_id);

    const viewedProductIds = await this.recentlyViewedRepo.find({
      where: { user_id: userId },
      select: ["product_id"],
    });
    const excludeIds = viewedProductIds.map((v) => v.product_id);

    const qb = this.productRepo
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.images", "img")
      .where("p.category_id IN (:...categoryIds)", { categoryIds })
      .andWhere("p.status = :status", { status: "published" })
      .andWhere("p.deleted_at IS NULL");

    if (excludeIds.length > 0) {
      qb.andWhere("p.id NOT IN (:...excludeIds)", { excludeIds });
    }

    return qb
      .orderBy("p.sales_count", "DESC")
      .addOrderBy("p.rating_avg", "DESC")
      .take(limit)
      .getMany();
  }

  async moreFromBrand(productId: string, limit = 6): Promise<Product[]> {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product?.vendor_id) return [];
    return this.productRepo.find({
      where: {
        vendor_id: product.vendor_id,
        status: "published" as any,
        id: Not(productId),
      },
      relations: ["images"],
      order: { sales_count: "DESC" },
      take: limit,
    });
  }

  async pairsWith(productId: string, limit = 4): Promise<Product[]> {
    const relations = await this.relationRepo.find({
      where: { product_id: productId, type: "cross_sell" as any },
      relations: ["relatedProduct", "relatedProduct.images"],
      order: { sort_order: "ASC" },
      take: limit,
    });
    return relations.map((r) => r.relatedProduct).filter((p) => p);
  }

  async crossBrand(productId: string, limit = 5): Promise<Product[]> {
    const relations = await this.relationRepo.find({
      where: [{ product_id: productId, type: "related" as any }],
      relations: ["relatedProduct", "relatedProduct.images"],
      order: { sort_order: "ASC" },
      take: limit,
    });
    const sameVendorRelations = relations.filter((r) => r.relatedProduct);
    if (sameVendorRelations.length >= limit) {
      return sameVendorRelations.map((r) => r.relatedProduct);
    }

    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) return sameVendorRelations.map((r) => r.relatedProduct);

    const existingIds = sameVendorRelations.map((r) => r.related_product_id);
    existingIds.push(productId);

    const qb = this.productRepo
      .createQueryBuilder("p")
      .leftJoinAndSelect("p.images", "img")
      .where("p.category_id = :categoryId", { categoryId: product.category_id })
      .andWhere("p.id NOT IN (:...excludeIds)", { excludeIds: existingIds })
      .andWhere("p.vendor_id <> :vendorId", { vendorId: product.vendor_id })
      .andWhere("p.status = :status", { status: "published" })
      .andWhere("p.deleted_at IS NULL")
      .orderBy("p.sales_count", "DESC")
      .take(limit - sameVendorRelations.length);

    const fallback = await qb.getMany();
    return [...sameVendorRelations.map((r) => r.relatedProduct), ...fallback];
  }

  async bestsellersInCategory(productId: string, limit = 8): Promise<Product[]> {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product?.category_id) return [];
    return this.productRepo.find({
      where: {
        category_id: product.category_id,
        status: "published" as any,
      },
      relations: ["images"],
      order: { sales_count: "DESC" },
      take: limit,
    });
  }
}
