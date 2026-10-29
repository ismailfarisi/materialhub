import {
  AffiliateCommission,
  AffiliateLink,
  type AffiliateLinkTargetType,
  AppDataSource,
  User,
  VendorAffiliate,
  VendorAffiliateStatus,
  VendorMember,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { IsNull } from "typeorm";
import type { Repository } from "typeorm";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomToken(len: number, prefix = ""): string {
  let out = prefix;
  for (let i = 0; i < len; i++)
    out += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  return out;
}

function normalizeTargetUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "/";
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const parsed = new URL(trimmed);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {}
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export interface InviteInput {
  email?: string;
  userId?: string;
  commissionType: "percentage" | "fixed";
  commissionValue: number;
}

export interface CreateAffiliateLinkInput {
  targetType: "store" | "product" | "brand" | "custom_url";
  targetId?: string | null;
  targetUrl?: string | null;
}

export class VendorAffiliateService {
  constructor(
    private readonly affiliateRepo: Repository<VendorAffiliate> = AppDataSource.getRepository(
      VendorAffiliate,
    ),
    private readonly linkRepo: Repository<AffiliateLink> = AppDataSource.getRepository(
      AffiliateLink,
    ),
    private readonly memberRepo: Repository<VendorMember> = AppDataSource.getRepository(
      VendorMember,
    ),
    private readonly userRepo: Repository<User> = AppDataSource.getRepository(User),
  ) {}

  private async genUniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = randomToken(8, "AFF-");
      const exists = await this.affiliateRepo.findOne({ where: { affiliate_code: code } });
      if (!exists) return code;
    }
    throw new HttpError(
      500,
      "Failed to generate unique affiliate code",
      "AFFILIATE_CODE_GEN_FAILED",
    );
  }

  private async genUniqueSlug(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const slug = randomToken(10);
      const exists = await this.linkRepo.findOne({ where: { slug } });
      if (!exists) return slug;
    }
    throw new HttpError(500, "Failed to generate unique link slug", "AFFILIATE_SLUG_GEN_FAILED");
  }

  async invite(
    vendorId: string,
    input: InviteInput,
    invitedByUserId: string,
  ): Promise<VendorAffiliate> {
    // Resolve the target user (by id or email) if the invitee already has an account.
    let userId = input.userId ?? null;
    if (!userId && input.email) {
      const user = await this.userRepo.findOne({ where: { email: input.email } });
      userId = user?.id ?? null;
    }

    // Self-dealing guard: the invitee must not be a member (staff) of THIS vendor.
    if (userId) {
      const member = await this.memberRepo.findOne({
        where: { vendor_id: vendorId, user_id: userId, deleted_at: IsNull() },
      });
      if (member) {
        throw new HttpError(
          400,
          "A vendor's own staff cannot be an affiliate for that store",
          "SELF_DEALING_FORBIDDEN",
        );
      }
      // Duplicate guard: one active/invited affiliate per (vendor, user).
      const existing = await this.affiliateRepo.findOne({
        where: { vendor_id: vendorId, user_id: userId, deleted_at: IsNull() },
      });
      if (existing) {
        throw new HttpError(
          409,
          "This user is already an affiliate for this store",
          "DUPLICATE_AFFILIATE",
        );
      }
    }

    const code = await this.genUniqueCode();
    const row = this.affiliateRepo.create({
      vendor_id: vendorId,
      user_id: userId,
      invite_email: input.email ?? null,
      status: VendorAffiliateStatus.invited,
      commission_type: input.commissionType as VendorAffiliate["commission_type"],
      commission_value: input.commissionValue,
      affiliate_code: code,
      invited_by: invitedByUserId,
    });
    return this.affiliateRepo.save(row);
  }

  async accept(userId: string, affiliateId: string): Promise<VendorAffiliate> {
    const aff = await this.affiliateRepo.findOne({
      where: { id: affiliateId, deleted_at: IsNull() },
    });
    if (!aff) throw new HttpError(404, "Affiliate invite not found", "AFFILIATE_NOT_FOUND");
    if (aff.user_id && aff.user_id !== userId) {
      throw new HttpError(403, "This invite belongs to another user", "AFFILIATE_WRONG_USER");
    }
    aff.user_id = userId;
    aff.status = VendorAffiliateStatus.active;
    aff.joined_at = new Date();
    return this.affiliateRepo.save(aff);
  }

  async listForVendor(vendorId: string): Promise<VendorAffiliate[]> {
    return this.affiliateRepo.find({
      where: { vendor_id: vendorId, deleted_at: IsNull() },
      order: { created_at: "DESC" },
    });
  }

  async getForVendor(vendorId: string, affiliateId: string): Promise<VendorAffiliate | null> {
    const aff = await this.affiliateRepo.findOne({
      where: { id: affiliateId, deleted_at: IsNull() },
    });
    return aff && aff.vendor_id === vendorId ? aff : null;
  }

  async setRate(
    vendorId: string,
    affiliateId: string,
    input: { commissionType: "percentage" | "fixed"; commissionValue: number },
  ): Promise<VendorAffiliate> {
    const aff = await this.getForVendor(vendorId, affiliateId);
    if (!aff) throw new HttpError(404, "Affiliate not found", "AFFILIATE_NOT_FOUND");
    aff.commission_type = input.commissionType as VendorAffiliate["commission_type"];
    aff.commission_value = input.commissionValue;
    return this.affiliateRepo.save(aff);
  }

  async setStatus(
    vendorId: string,
    affiliateId: string,
    status: "active" | "suspended" | "revoked",
  ): Promise<VendorAffiliate> {
    const aff = await this.getForVendor(vendorId, affiliateId);
    if (!aff) throw new HttpError(404, "Affiliate not found", "AFFILIATE_NOT_FOUND");
    aff.status = status as VendorAffiliate["status"];
    return this.affiliateRepo.save(aff);
  }

  async createLink(
    vendorId: string,
    affiliateId: string,
    input: CreateAffiliateLinkInput,
  ): Promise<AffiliateLink> {
    const aff = await this.getForVendor(vendorId, affiliateId);
    if (!aff) throw new HttpError(404, "Affiliate not found", "AFFILIATE_NOT_FOUND");
    if ((input.targetType === "product" || input.targetType === "brand") && !input.targetId) {
      throw new HttpError(
        400,
        `targetId is required for ${input.targetType} links`,
        "AFFILIATE_LINK_TARGET_REQUIRED",
      );
    }
    if (input.targetType === "custom_url" && (!input.targetUrl || !input.targetUrl.trim())) {
      throw new HttpError(
        400,
        "targetUrl is required for custom_url links",
        "AFFILIATE_LINK_TARGET_REQUIRED",
      );
    }
    const slug = await this.genUniqueSlug();
    const row = this.linkRepo.create({
      vendor_affiliate_id: aff.id,
      target_type: input.targetType as AffiliateLinkTargetType,
      target_id:
        input.targetType === "product" || input.targetType === "brand"
          ? (input.targetId ?? null)
          : null,
      target_url:
        input.targetType === "custom_url" && input.targetUrl
          ? normalizeTargetUrl(input.targetUrl)
          : null,
      slug,
      click_count: 0,
    });
    return this.linkRepo.save(row);
  }

  async listLinks(affiliateId: string): Promise<AffiliateLink[]> {
    return this.linkRepo.find({
      where: { vendor_affiliate_id: affiliateId, deleted_at: IsNull() },
      order: { created_at: "DESC" },
    });
  }

  // ── Admin management ──────────────────────────────────────────
  async getById(affiliateId: string): Promise<VendorAffiliate | null> {
    return this.affiliateRepo.findOne({
      where: { id: affiliateId, deleted_at: IsNull() },
      relations: ["vendor", "user"],
    });
  }

  async setRateByAdmin(
    affiliateId: string,
    input: { commissionType: "percentage" | "fixed"; commissionValue: number },
  ): Promise<VendorAffiliate> {
    const aff = await this.affiliateRepo.findOne({
      where: { id: affiliateId, deleted_at: IsNull() },
    });
    if (!aff) throw new HttpError(404, "Affiliate not found", "AFFILIATE_NOT_FOUND");
    aff.commission_type = input.commissionType as VendorAffiliate["commission_type"];
    aff.commission_value = input.commissionValue;
    return this.affiliateRepo.save(aff);
  }

  async setStatusByAdmin(
    affiliateId: string,
    status: "active" | "suspended" | "revoked",
  ): Promise<VendorAffiliate> {
    const aff = await this.affiliateRepo.findOne({
      where: { id: affiliateId, deleted_at: IsNull() },
    });
    if (!aff) throw new HttpError(404, "Affiliate not found", "AFFILIATE_NOT_FOUND");
    aff.status = status as VendorAffiliate["status"];
    return this.affiliateRepo.save(aff);
  }

  async createLinkByAdmin(
    affiliateId: string,
    input: CreateAffiliateLinkInput,
  ): Promise<AffiliateLink> {
    const aff = await this.affiliateRepo.findOne({
      where: { id: affiliateId, deleted_at: IsNull() },
    });
    if (!aff) throw new HttpError(404, "Affiliate not found", "AFFILIATE_NOT_FOUND");
    if ((input.targetType === "product" || input.targetType === "brand") && !input.targetId) {
      throw new HttpError(
        400,
        `targetId is required for ${input.targetType} links`,
        "AFFILIATE_LINK_TARGET_REQUIRED",
      );
    }
    if (input.targetType === "custom_url" && (!input.targetUrl || !input.targetUrl.trim())) {
      throw new HttpError(
        400,
        "targetUrl is required for custom_url links",
        "AFFILIATE_LINK_TARGET_REQUIRED",
      );
    }
    const slug = await this.genUniqueSlug();
    const row = this.linkRepo.create({
      vendor_affiliate_id: aff.id,
      target_type: input.targetType as AffiliateLinkTargetType,
      target_id:
        input.targetType === "product" || input.targetType === "brand"
          ? (input.targetId ?? null)
          : null,
      target_url:
        input.targetType === "custom_url" && input.targetUrl
          ? normalizeTargetUrl(input.targetUrl)
          : null,
      slug,
      click_count: 0,
    });
    return this.linkRepo.save(row);
  }

  async listAllForAdmin(query: {
    vendorId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: VendorAffiliate[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.vendorId
      ? { vendor_id: query.vendorId, deleted_at: IsNull() }
      : { deleted_at: IsNull() };
    const [data, total] = await this.affiliateRepo.findAndCount({
      where,
      relations: ["vendor", "user"],
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async listCommissionsForAffiliate(affiliateId: string): Promise<AffiliateCommission[]> {
    return AppDataSource.getRepository(AffiliateCommission).find({
      where: { vendor_affiliate_id: affiliateId },
      order: { created_at: "DESC" },
      take: 200,
    });
  }
}
