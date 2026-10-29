import type { ReferralService } from "../services/referral.service.ts";

export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  async getMyCode(userId: string) {
    return this.referralService.getMyReferralCode(userId);
  }

  async listMyReferrals(userId: string, page?: number, limit?: number) {
    return this.referralService.listMyReferrals(userId, page, limit);
  }

  async lookupCode(code: string) {
    return this.referralService.findByCode(code);
  }
}
