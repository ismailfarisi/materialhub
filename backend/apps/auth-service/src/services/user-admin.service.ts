import { AppDataSource, CreatorTier, User } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { Repository } from "typeorm";

export class UserAdminService {
  private userRepo: Repository<User>;

  constructor(userRepo?: Repository<User>) {
    this.userRepo = userRepo ?? AppDataSource.getRepository(User);
  }

  async list(query: {
    search?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.userRepo
      .createQueryBuilder("user")
      .select([
        "user.id",
        "user.first_name",
        "user.last_name",
        "user.email",
        "user.phone",
        "user.role",
        "user.status",
        "user.avatar_url",
        "user.creator_tier",
        "user.last_login_at",
        "user.created_at",
      ])
      .where("user.deleted_at IS NULL");

    if (query.search) {
      qb.andWhere(
        "(user.first_name ILIKE :s OR user.last_name ILIKE :s OR user.email ILIKE :s OR user.phone ILIKE :s)",
        {
          s: `%${query.search}%`,
        },
      );
    }
    if (query.role) qb.andWhere("user.role = :role", { role: query.role });
    if (query.status) qb.andWhere("user.status = :status", { status: query.status });

    qb.orderBy("user.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data: { users: data, total, limit, page }, total };
  }

  async getById(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        phone_verified_at: true,
        email_verified_at: true,
        role: true,
        status: true,
        avatar_url: true,
        preferred_locale: true,
        preferred_currency: true,
        google_id: true,
        apple_id: true,
        wallet_balance: true,
        wallet_currency: true,
        can_tag_unowned: true,
        follower_count: true,
        following_count: true,
        published_reel_count: true,
        creator_tier: true,
        creator_tier_earned_at: true,
        last_login_at: true,
        created_at: true,
      },
    });
    if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    return user;
  }

  async updateCreatorTier(userId: string, tier: string) {
    const valid: string[] = [CreatorTier.regular, CreatorTier.creator, CreatorTier.influencer];
    if (!valid.includes(tier)) {
      throw new HttpError(400, "Invalid creator tier", "INVALID_CREATOR_TIER");
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    const previousTier = user.creator_tier;
    user.creator_tier = tier as CreatorTier;
    // Stamp the earned-at when promoting; clear it when demoting to regular.
    user.creator_tier_earned_at = (tier === CreatorTier.regular ? null : new Date()) as any;
    await this.userRepo.save(user);
    return { id: user.id, creator_tier: user.creator_tier, previous_tier: previousTier };
  }

  async updateStatus(userId: string, status: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    const previousStatus = user.status;
    user.status = status as any;
    if (status === "suspended") {
      user.locked_until = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
    } else if (status === "active") {
      user.locked_until = null as any;
      user.login_attempts = 0;
    }
    await this.userRepo.save(user);
    return { id: user.id, status: user.status, previous_status: previousStatus };
  }

  async updateRole(userId: string, role: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    const previousRole = user.role;
    user.role = role as any;
    await this.userRepo.save(user);
    return { id: user.id, role: user.role, previous_role: previousRole };
  }
}
