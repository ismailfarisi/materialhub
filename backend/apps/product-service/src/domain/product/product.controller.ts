import type { ProductBundleService } from "./product-bundle.service.ts";
import type { ProductGroupService } from "./product-group.service.ts";
import type { ProductQuestionService } from "./product-question.service.ts";
import type { ProductRelationService } from "./product-relation.service.ts";
import type { ProductVariantService } from "./product-variant.service.ts";
import type { ProductService } from "./product.service.ts";

export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly variantService: ProductVariantService,
    private readonly relationService: ProductRelationService,
    private readonly questionService: ProductQuestionService,
    private readonly bundleService: ProductBundleService,
    private readonly productGroupService: ProductGroupService,
  ) {}

  async create(vendorId: string, data: any) {
    return this.productService.create(vendorId, data);
  }
  async update(productId: string, vendorId: string, data: any) {
    return this.productService.update(productId, vendorId, data);
  }
  async remove(productId: string, vendorId: string) {
    return this.productService.remove(productId, vendorId);
  }
  async publish(productId: string, vendorId: string) {
    return this.productService.publish(productId, vendorId);
  }
  async unpublish(productId: string, vendorId: string) {
    return this.productService.unpublish(productId, vendorId);
  }
  async getByIdForVendor(id: string, vendorId: string) {
    return this.productService.getByIdForVendor(id, vendorId);
  }
  async bulkAction(vendorId: string, data: any) {
    return this.productService.bulkAction(vendorId, data.action, data.ids);
  }
  async getBySlug(slug: string) {
    return this.productService.getBySlug(slug);
  }
  async getGroupBySlug(slug: string) {
    return this.productService.getGroupBySlug(slug);
  }
  async getById(id: string) {
    return this.productService.getById(id);
  }
  async adminGetById(id: string) {
    return this.productService.getByIdForAdmin(id);
  }
  async search(filters: any) {
    return this.productService.search(filters);
  }
  async listByVendor(vendorId: string, filters: any) {
    return this.productService.listByVendor(vendorId, filters);
  }

  // Images
  async addImage(productId: string, vendorId: string, data: any) {
    return this.productService.addImage(productId, vendorId, data);
  }
  async reorderImages(productId: string, vendorId: string, items: any) {
    return this.productService.reorderImages(productId, vendorId, items);
  }
  async removeImage(productId: string, vendorId: string, imageId: string) {
    return this.productService.removeImage(productId, vendorId, imageId);
  }

  // Variants
  async generateVariants(productId: string, vendorId: string, data: any) {
    return this.createVariants(productId, vendorId, data);
  }
  /** `vendorId` null = admin; otherwise the product must belong to that vendor. */
  async updateVariant(
    productId: string,
    variantId: string,
    data: any,
    vendorId: string | null = null,
  ) {
    return this.variantService.update(productId, variantId, data, vendorId);
  }
  private async createVariants(productId: string, vendorId: string | null, data: any) {
    if (data.variants?.length) {
      return this.variantService.createExplicitVariants(productId, vendorId, data.variants);
    }
    const mapped = (data.options ?? []).map((o: any) => ({
      attributeId: o.attribute_id,
      valueIds: o.values,
    }));
    return this.variantService.generateVariants(productId, vendorId, mapped);
  }
  async removeVariant(productId: string, variantId: string, vendorId: string | null = null) {
    return this.variantService.remove(productId, variantId, vendorId);
  }

  // Relations
  async addRelation(productId: string, data: any) {
    return this.relationService.add(productId, data.related_product_id, data.type, data.sort_order);
  }
  async removeRelation(productId: string, relationId: string) {
    return this.relationService.remove(productId, relationId);
  }

  // Q&A
  async askQuestion(productId: string, userId: string, question: string) {
    return this.questionService.ask(productId, userId, question);
  }
  async answerQuestion(productId: string, questionId: string, userId: string, answer: string) {
    return this.questionService.answer(productId, questionId, userId, answer);
  }
  async listQuestions(productId: string) {
    return this.questionService.list(productId);
  }

  // Bundles
  async createBundle(productId: string, data: any) {
    return this.bundleService.create(productId, data);
  }
  async updateBundle(productId: string, data: any) {
    return this.bundleService.update(productId, data);
  }
  async removeBundle(productId: string) {
    return this.bundleService.remove(productId);
  }

  // ── Admin Methods ───────────────────────────────────────────────────

  async adminCreate(vendorId: string, data: any) {
    return this.productService.adminCreate(vendorId, data);
  }
  async adminList(filters: any) {
    return this.productService.adminList(filters);
  }
  async adminUpdate(productId: string, data: any) {
    return this.productService.adminUpdate(productId, data);
  }
  async adminRemove(productId: string) {
    return this.productService.adminRemove(productId);
  }
  async adminApprove(productId: string, reviewerId: string) {
    return this.productService.adminApprove(productId, reviewerId);
  }
  async adminReject(productId: string, reviewerId: string, reason: string) {
    return this.productService.adminReject(productId, reviewerId, reason);
  }
  async adminPublish(productId: string) {
    return this.productService.adminPublish(productId);
  }
  async adminUnpublish(productId: string) {
    return this.productService.adminUnpublish(productId);
  }
  async adminToggleFeature(productId: string) {
    return this.productService.adminToggleFeature(productId);
  }
  async adminBulkAction(action: string, ids: string[], options?: any) {
    return this.productService.adminBulkAction(action as any, ids, options);
  }
  async adminAddImage(productId: string, data: any) {
    return this.productService.adminAddImage(productId, data);
  }
  async adminReorderImages(productId: string, items: any) {
    return this.productService.adminReorderImages(productId, items);
  }
  async adminRemoveImage(productId: string, imageId: string) {
    return this.productService.adminRemoveImage(productId, imageId);
  }
  async adminGenerateVariants(productId: string, data: any) {
    return this.createVariants(productId, null, data);
  }

  // Groups
  async createGroup(vendorId: string, body: any) {
    return this.productGroupService.createGroup(vendorId, body);
  }
  async getGroup(groupId: string, vendorId: string) {
    return this.productGroupService.getGroup(groupId, vendorId);
  }
  async getGroupByProduct(productId: string, vendorId: string) {
    return this.productGroupService.getGroupByProduct(productId, vendorId);
  }
  async updateGroup(groupId: string, vendorId: string, body: any) {
    return this.productGroupService.updateGroup(groupId, vendorId, body);
  }
  async removeGroupMember(groupId: string, vendorId: string, memberId: string) {
    return this.productGroupService.removeMember(groupId, vendorId, memberId);
  }
}
