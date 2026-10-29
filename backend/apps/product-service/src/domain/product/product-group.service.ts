import {
  AppDataSource,
  Attribute,
  Product,
  ProductAttributeValue,
  ProductGroup,
  ProductGroupMember,
} from "@materialhub/database";
import type { CreateProductGroupBody, UpdateProductGroupBody } from "@materialhub/dto";
import { HttpError } from "@materialhub/plugins";
import { generateSlug } from "@materialhub/utils";
import { IsNull } from "typeorm";

const GROUPABLE_TYPES = new Set(["select", "color"]);

// Injected so the service can trigger a per-product Typesense reindex without
// depending on the concrete search adapter (keeps the unit test pure).
export interface GroupReindexer {
  reindexProduct(productId: string): Promise<void>;
}

export class ProductGroupService {
  constructor(private readonly reindexer: GroupReindexer) {}

  private get repo() {
    return AppDataSource.getRepository(ProductGroup);
  }

  async createGroup(vendorId: string, body: CreateProductGroupBody) {
    // Duplicate-value check can happen before the transaction (no DB needed)
    const seen = new Set<string>();
    for (const m of body.members) {
      if (seen.has(m.attribute_value_id)) {
        throw new HttpError(422, "Each shade may appear once per group", "DUPLICATE_GROUP_VALUE");
      }
      seen.add(m.attribute_value_id);
    }

    const flaggedIndex = body.members.findIndex((m) => m.is_primary);
    const primaryIndex = flaggedIndex >= 0 ? flaggedIndex : 0;

    const { group, productIds } = await AppDataSource.transaction(async (manager) => {
      // Attribute lookup inside the transaction so the manager mock can handle it
      const attribute = await manager.getRepository(Attribute).findOne({
        where: { id: body.grouping_attribute_id },
      });
      if (!attribute || !attribute.is_groupable || !GROUPABLE_TYPES.has(attribute.type as string)) {
        throw new HttpError(
          422,
          "Grouping attribute must be a groupable select/color attribute",
          "ATTRIBUTE_NOT_GROUPABLE",
        );
      }

      const group = await manager.save(
        ProductGroup,
        manager.create(ProductGroup, {
          vendor_id: vendorId,
          category_id: body.shared.category_id,
          name: body.name,
          grouping_attribute_id: body.grouping_attribute_id,
          listing_mode: (body.listing_mode ?? "collapsed") as any,
        }),
      );

      const productIds: string[] = [];
      for (const [i, m] of body.members.entries()) {
        let slug = generateSlug(`${body.name}-${m.name}`);
        const slugExists = await manager.getRepository(Product).findOne({ where: { slug } });
        if (slugExists) {
          // include index + base36 time to avoid same-millisecond collisions between members
          slug = `${slug}-${i}${Date.now().toString(36)}`;
        }
        const product = await manager.save(
          Product,
          manager.create(Product, {
            vendor_id: vendorId,
            category_id: body.shared.category_id,
            brand_id: body.shared.brand_id ?? null,
            name: m.name,
            slug,
            short_description: body.shared.short_description ?? null,
            description: body.shared.description ?? null,
            price: m.price,
            compare_at_price: m.compare_at_price ?? null,
            cost_price: m.cost_price ?? null,
            sku: m.sku ?? null,
            barcode: m.barcode ?? null,
            status: "draft" as any,
          }),
        );
        productIds.push(product.id);

        await manager.save(
          ProductAttributeValue,
          manager.create(ProductAttributeValue, {
            product_id: product.id,
            attribute_id: body.grouping_attribute_id,
            attribute_value_id: m.attribute_value_id,
          }),
        );

        await manager.save(
          ProductGroupMember,
          manager.create(ProductGroupMember, {
            group_id: group.id,
            product_id: product.id,
            attribute_value_id: m.attribute_value_id,
            is_primary: i === primaryIndex,
            sort_order: i,
          }),
        );
      }

      return { group, productIds };
    });

    for (const id of productIds) {
      await this.reindexer.reindexProduct(id);
    }

    return this.getGroup(group.id, vendorId);
  }

  async getGroupByProduct(productId: string, vendorId: string) {
    const membership = await AppDataSource.getRepository(ProductGroupMember).findOne({
      where: { product_id: productId },
    });
    if (!membership) return null;
    return this.getGroup(membership.group_id, vendorId);
  }

  async getGroup(groupId: string, vendorId: string) {
    const group = await this.repo.findOne({
      where: { id: groupId, vendor_id: vendorId },
      relations: ["members", "members.product", "members.attributeValue", "groupingAttribute"],
    });
    if (!group) throw new HttpError(404, "Product group not found", "PRODUCT_GROUP_NOT_FOUND");
    return group;
  }

  async updateGroup(groupId: string, vendorId: string, body: UpdateProductGroupBody) {
    const group = await this.getGroup(groupId, vendorId);

    // Validate primary_member_id against live members before any write
    if (body.primary_member_id) {
      const target = group.members.find((m) => m.id === body.primary_member_id);
      if (!target) throw new HttpError(404, "Group member not found", "GROUP_MEMBER_NOT_FOUND");
    }

    await AppDataSource.transaction(async (manager) => {
      // Update group metadata with only the provided fields
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.listing_mode !== undefined) patch.listing_mode = body.listing_mode;
      if (Object.keys(patch).length > 0) {
        await manager.update(ProductGroup, { id: groupId }, patch);
      }

      if (body.primary_member_id) {
        await manager.update(
          ProductGroupMember,
          { group_id: groupId, deleted_at: IsNull() },
          { is_primary: false },
        );
        await manager.update(
          ProductGroupMember,
          { id: body.primary_member_id, group_id: groupId },
          { is_primary: true },
        );
      }
    });

    const fresh = await this.getGroup(groupId, vendorId);
    for (const m of fresh.members) await this.reindexer.reindexProduct(m.product_id);
    return fresh;
  }

  async removeMember(groupId: string, vendorId: string, memberId: string) {
    const group = await this.getGroup(groupId, vendorId);
    const member = group.members.find((m) => m.id === memberId);
    if (!member) throw new HttpError(404, "Group member not found", "GROUP_MEMBER_NOT_FOUND");

    const wasPrimary = member.is_primary;
    const remaining = group.members.filter((m) => m.id !== memberId);
    const next =
      wasPrimary && remaining.length > 0
        ? remaining.sort((a, b) => a.sort_order - b.sort_order)[0]
        : null;

    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(ProductGroupMember).softRemove(member);
      if (next) {
        await manager.update(ProductGroupMember, { id: next.id }, { is_primary: true });
      }
    });

    await this.reindexer.reindexProduct(member.product_id);
    if (next) await this.reindexer.reindexProduct(next.product_id);

    return { id: memberId, removed: true };
  }
}
