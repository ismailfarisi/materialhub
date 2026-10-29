import {
  AppDataSource,
  ProductCollection,
  ProductCollectionMember,
  ProductCollectionSort,
} from "@materialhub/database";
import type { SearchService } from "../search/search.interface.ts";
import { DEFAULT_COLLECTION_CEILING, orderMembers } from "./collection-order.ts";
import { rulesToFilters } from "./collection-resolver.service.ts";
import type { CollectionService } from "./collection.service.ts";

/** Membership ignores ordering — it's a set — but reuse orderMembers for the
 * exact same union/exclude/dedup/cap semantics as display. */
export function computeMemberIds(opts: {
  pinIds: string[];
  ruleIds: string[];
  excludeIds: string[];
  cap: number;
}): string[] {
  return orderMembers(opts);
}

export class CollectionMembershipService {
  constructor(
    private search: SearchService,
    private items: Pick<CollectionService, "loadPinsAndExcludes">,
  ) {}

  async refresh(collectionId: string): Promise<number> {
    const repo = AppDataSource.getRepository(ProductCollection);
    const collection = await repo.findOne({ where: { id: collectionId } });
    if (!collection) return 0;

    const cap = collection.max_products ?? DEFAULT_COLLECTION_CEILING;
    const { pinIds, excludeIds } = await this.items.loadPinsAndExcludes(collectionId);

    let ruleIds: string[] = [];
    if (collection.rules && Object.keys(collection.rules.conditions ?? {}).length > 0) {
      // Use newest sort for a stable, deterministic membership read.
      ruleIds = await this.search.searchProductIds(
        rulesToFilters(collection.rules, ProductCollectionSort.newest),
        cap,
      );
    }

    const memberIds = computeMemberIds({ pinIds, ruleIds, excludeIds, cap });

    await AppDataSource.transaction(async (mgr) => {
      await mgr.delete(ProductCollectionMember, { collection_id: collectionId });
      if (memberIds.length) {
        await mgr
          .createQueryBuilder()
          .insert()
          .into(ProductCollectionMember)
          .values(memberIds.map((product_id) => ({ collection_id: collectionId, product_id })))
          .orIgnore()
          .execute();
      }
    });

    return memberIds.length;
  }
}
