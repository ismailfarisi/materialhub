import { AppDataSource, Referral, User } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { IsNull } from "typeorm";

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "REF-";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class ReferralService {
  private get repo() {
    return AppDataSource.getRepository(Referral);
  }
  private get userRepo() {
    return AppDataSource.getRepository(User);
  }

  async createReferralCode(userId: string): Promise<string> {
    let code: string;
    let attempts = 0;
    do {
      code = generateReferralCode();
      const exists = await this.repo.findOne({ where: { referral_code: code } });
      if (!exists) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new HttpError(
        500,
        "Failed to generate unique referral code",
        "REFERRAL_CODE_GENERATION_FAILED",
      );
    }

    const referral = this.repo.create({
      referrer_id: userId,
      referral_code: code,
      status: "pending",
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    await this.repo.save(referral);
    return code;
  }

  async findByCode(code: string): Promise<Referral | null> {
    return this.repo.findOne({
      where: { referral_code: code, referred_id: IsNull() },
    });
  }

  async attributeSignup(
    referralCode: string,
    referredUserId: string,
    referredEmail: string,
    _deviceFingerprint?: string,
  ): Promise<void> {
    const master = await this.repo.findOne({
      where: { referral_code: referralCode, referred_id: IsNull() },
    });

    if (!master) return;

    if (master.expires_at && master.expires_at < new Date()) {
      master.status = "expired";
      await this.repo.save(master);
      return;
    }

    if (master.referrer_id === referredUserId) return;

    const existingByEmail = await this.repo.findOne({
      where: { referred_email: referredEmail },
    });
    if (existingByEmail?.referred_id) return;

    // Update the master row with the referred user's info
    master.referred_id = referredUserId;
    master.referred_email = referredEmail;
    master.status = "signed_up";
    await this.repo.save(master);

    // Generate a new referral code for the referrer so they can refer more people
    await this.createReferralCode(master.referrer_id);
  }

  async getMyReferralCode(userId: string): Promise<string | null> {
    const master = await this.repo.findOne({
      where: { referrer_id: userId, referred_id: IsNull() },
    });
    return master?.referral_code ?? null;
  }

  async listMyReferrals(userId: string, page = 1, limit = 20) {
    const qb = this.repo
      .createQueryBuilder("r")
      .where("r.referrer_id = :userId", { userId })
      .andWhere("r.referred_id IS NOT NULL")
      .orderBy("r.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    const sanitized = items.map((r) => ({
      id: r.id,
      referral_code: r.referral_code,
      referred_email: r.referred_email,
      status: r.status,
      referrer_reward_amount: r.referrer_reward_amount,
      referred_reward_amount: r.referred_reward_amount,
      rewarded_at: r.rewarded_at,
      created_at: r.created_at,
    }));

    return { items: sanitized, total, page, limit };
  }
}
