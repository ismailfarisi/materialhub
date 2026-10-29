import {
  AppDataSource,
  Product,
  Reel,
  ReelProductTag,
  ReelStatus,
  User,
  UserTaggingPermission,
} from "@materialhub/database";
import type { Repository } from "typeorm";
import type { VerifiedPurchaseGuard } from "./verified-purchase.guard.ts";

export interface AddTagInput {
  reelId: string;
  userId: string;
  activeVendorId?: string | null;
  productId: string;
  variantId?: string;
  timestampSeconds: number;
  displayX?: number;
  displayY?: number;
}

interface Repos {
  reelRepo: Repository<Reel>;
  productRepo: Repository<Product>;
  permRepo: Repository<UserTaggingPermission>;
  userRepo: Repository<User>;
  tagRepo: Repository<ReelProductTag>;
}

export class ReelTagService {
  private repos: Repos | null = null;

  constructor(private readonly guard: VerifiedPurchaseGuard) {}

  setRepos(repos: Repos) {
    this.repos = repos;
  }

  private getRepos(): Repos {
    if (this.repos) return this.repos;
    this.repos = {
      reelRepo: AppDataSource.getRepository(Reel),
      productRepo: AppDataSource.getRepository(Product),
      permRepo: AppDataSource.getRepository(UserTaggingPermission),
      userRepo: AppDataSource.getRepository(User),
      tagRepo: AppDataSource.getRepository(ReelProductTag),
    };
    return this.repos;
  }

  async addTag(input: AddTagInput): Promise<ReelProductTag> {
    const { reelRepo, productRepo, permRepo, userRepo, tagRepo } = this.getRepos();

    const reel = await reelRepo.findOne({ where: { id: input.reelId } });
    if (!reel) throw new Error("reel_not_found");
    if (reel.user_id !== input.userId) throw new Error("not_the_owner");
    if (reel.status !== ReelStatus.draft) throw new Error("reel_not_in_draft_state");

    const product = await productRepo.findOne({
      where: { id: input.productId },
    });
    if (!product) throw new Error("product_not_found");

    const user = await userRepo.findOne({ where: { id: input.userId } });
    if (!user) throw new Error("user_not_found");

    const productVendorId = (product as any).vendor_id ?? null;
    const productBrandId = (product as any).brand_id ?? null;
    const ownsVendorOfProduct =
      !!input.activeVendorId && !!productVendorId && input.activeVendorId === productVendorId;

    const taggingPermissions = await permRepo.find({
      where: { user_id: input.userId },
    });

    const verdict = await this.guard.canTag({
      userId: input.userId,
      productId: input.productId,
      canTagUnowned: !!user.can_tag_unowned,
      ownsVendorOfProduct,
      taggingPermissions,
      productBrandId,
      productVendorId,
    });
    if (!verdict.allowed) {
      throw new Error(`forbidden:tag:${verdict.reason}`);
    }

    const tag = tagRepo.create({
      reel_id: input.reelId,
      product_id: input.productId,
      variant_id: input.variantId ?? null,
      timestamp_seconds: String(input.timestampSeconds),
      display_x: input.displayX != null ? String(input.displayX) : null,
      display_y: input.displayY != null ? String(input.displayY) : null,
    });
    return tagRepo.save(tag);
  }

  async removeTag(reelId: string, tagId: string, userId: string): Promise<void> {
    const { reelRepo, tagRepo } = this.getRepos();
    const reel = await reelRepo.findOne({ where: { id: reelId } });
    if (!reel) throw new Error("reel_not_found");
    if (reel.user_id !== userId) throw new Error("not_the_owner");
    if (reel.status !== ReelStatus.draft) throw new Error("reel_not_in_draft_state");
    await tagRepo.delete({ id: tagId, reel_id: reelId });
  }
}
