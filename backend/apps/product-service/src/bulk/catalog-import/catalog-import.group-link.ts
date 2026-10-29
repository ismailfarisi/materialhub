import { ProductGroup, ProductGroupListingMode, ProductGroupMember } from "@materialhub/database";
import type { DeepPartial, EntityManager } from "typeorm";

export interface GroupLink {
  productId: string;
  groupName: string;
  groupingAttributeId: string;
  attributeValueId: string;
  rowNumber: number;
}

export async function linkProductGroups(
  manager: EntityManager,
  vendorId: string,
  links: GroupLink[],
): Promise<string[]> {
  const byGroup = new Map<string, GroupLink[]>();
  for (const link of links) {
    const list = byGroup.get(link.groupName) ?? [];
    list.push(link);
    byGroup.set(link.groupName, list);
  }

  const affected = new Set<string>();
  const groupRepo = manager.getRepository(ProductGroup);
  const memberRepo = manager.getRepository(ProductGroupMember);

  for (const [groupName, members] of byGroup) {
    members.sort((a, b) => a.rowNumber - b.rowNumber);
    const groupingAttributeId = members[0]?.groupingAttributeId;
    if (!groupingAttributeId) continue;

    let group = await groupRepo.findOne({
      where: { vendor_id: vendorId, name: groupName },
    });
    if (!group) {
      const row: DeepPartial<ProductGroup> = {
        vendor_id: vendorId,
        name: groupName,
        grouping_attribute_id: groupingAttributeId,
        listing_mode: ProductGroupListingMode.collapsed,
      };
      group = await groupRepo.save(groupRepo.create(row));
    }

    if (!group) continue;

    const existingMembers = await memberRepo.find({ where: { group_id: group.id } });
    let hasPrimary = existingMembers.some((m) => m.is_primary);

    for (const [index, link] of members.entries()) {
      affected.add(link.productId);
      const current = await memberRepo.findOne({
        where: { group_id: group.id, product_id: link.productId },
      });
      if (current) {
        current.attribute_value_id = link.attributeValueId;
        current.sort_order = index;
        await memberRepo.save(current);
        continue;
      }

      const isPrimary = !hasPrimary;
      if (isPrimary) hasPrimary = true;
      const row: DeepPartial<ProductGroupMember> = {
        group_id: group.id,
        product_id: link.productId,
        attribute_value_id: link.attributeValueId,
        is_primary: isPrimary,
        sort_order: index,
      };
      await memberRepo.save(memberRepo.create(row));
    }
  }

  return [...affected];
}
