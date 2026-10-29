import { AppDataSource, type ReelTaggingScope, UserTaggingPermission } from "@materialhub/database";

export interface GrantInput {
  userId: string;
  scope: ReelTaggingScope;
  brandId?: string;
  vendorId?: string;
  productIds?: string[];
  expiresAt?: Date;
  reason?: string;
  grantedBy: string;
}

export class TaggingPermissionsService {
  private get repo() {
    return AppDataSource.getRepository(UserTaggingPermission);
  }

  async list(): Promise<UserTaggingPermission[]> {
    return this.repo.find({ order: { granted_at: "DESC" } });
  }

  async grant(input: GrantInput): Promise<UserTaggingPermission> {
    const perm = this.repo.create({
      user_id: input.userId,
      scope: input.scope,
      brand_id: input.brandId ?? null,
      vendor_id: input.vendorId ?? null,
      product_ids: input.productIds ?? null,
      granted_by: input.grantedBy,
      expires_at: input.expiresAt ?? null,
      reason: input.reason ?? null,
    } as Partial<UserTaggingPermission>);
    return this.repo.save(perm);
  }

  async revoke(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
