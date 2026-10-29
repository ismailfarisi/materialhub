import { AppDataSource, Product, Wishlist } from "@materialhub/database";

export class WishlistService {
  private get repo() {
    return AppDataSource.getRepository(Wishlist);
  }
  private get productRepo() {
    return AppDataSource.getRepository(Product);
  }

  async toggle(
    productId: string,
    variantId: string | null,
    userId: string | null,
    guestSessionId: string | null,
  ) {
    const where: any = { product_id: productId };
    if (userId) where.user_id = userId;
    else where.guest_session_id = guestSessionId;

    const existing = await this.repo.findOne({ where });

    if (existing) {
      await this.repo.softRemove(existing);
      await this.productRepo.decrement({ id: productId }, "wishlist_count", 1);
      return { action: "removed" };
    }

    const item = this.repo.create({
      product_id: productId,
      variant_id: variantId,
      user_id: userId,
      guest_session_id: guestSessionId,
      added_at: new Date(),
    });
    await this.repo.save(item);
    await this.productRepo.increment({ id: productId }, "wishlist_count", 1);
    return { action: "added", item };
  }

  async list(userId: string | null, guestSessionId: string | null, page = 1, limit = 20) {
    const where: any = {};
    if (userId) where.user_id = userId;
    else where.guest_session_id = guestSessionId;

    const [items, total] = await this.repo.findAndCount({
      where,
      // product.images/vendor/brand are needed so clients can render product
      // cards from the wishlist without a second round-trip per item.
      relations: ["product", "product.images", "product.vendor", "product.brand", "variant"],
      order: { added_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }

  async mergeGuestToUser(guestSessionId: string, userId: string) {
    const guestItems = await this.repo.find({ where: { guest_session_id: guestSessionId } });

    for (const item of guestItems) {
      const existing = await this.repo.findOne({
        where: { user_id: userId, product_id: item.product_id },
      });
      if (!existing) {
        item.user_id = userId;
        item.guest_session_id = null;
        await this.repo.save(item);
      } else {
        await this.repo.softRemove(item);
      }
    }
  }

  async isWishlisted(
    productId: string,
    userId: string | null,
    guestSessionId: string | null,
  ): Promise<boolean> {
    const where: any = { product_id: productId };
    if (userId) where.user_id = userId;
    else where.guest_session_id = guestSessionId;
    return !!(await this.repo.findOne({ where }));
  }
}
