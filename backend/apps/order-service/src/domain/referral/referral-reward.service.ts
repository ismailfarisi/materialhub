import { AppDataSource, Referral, SiteSetting, User, WalletTransaction } from "@materialhub/database";

export class ReferralRewardService {
  private get referralRepo() {
    return AppDataSource.getRepository(Referral);
  }
  private get walletTxRepo() {
    return AppDataSource.getRepository(WalletTransaction);
  }
  private get userRepo() {
    return AppDataSource.getRepository(User);
  }
  private get settingsRepo() {
    return AppDataSource.getRepository(SiteSetting);
  }

  async processFirstPurchaseReward(userId: string, orderId: string): Promise<void> {
    const referral = await this.referralRepo.findOne({
      where: { referred_id: userId, status: "signed_up" },
    });

    if (!referral) return;

    const referrerRewardSetting = await this.settingsRepo.findOne({
      where: { key: "referral_reward_referrer" },
    });
    const referredRewardSetting = await this.settingsRepo.findOne({
      where: { key: "referral_reward_referred" },
    });

    const referrerReward = referrerRewardSetting
      ? Number.parseInt(referrerRewardSetting.value) * 100
      : 2500;
    const referredReward = referredRewardSetting
      ? Number.parseInt(referredRewardSetting.value) * 100
      : 1000;

    // Award referrer
    const referrer = await this.userRepo.findOne({ where: { id: referral.referrer_id } });
    if (referrer) {
      const referrerBalanceBefore = referrer.wallet_balance;
      referrer.wallet_balance += referrerReward;
      await this.userRepo.save(referrer);

      await this.walletTxRepo.save(
        this.walletTxRepo.create({
          user_id: referral.referrer_id,
          amount: referrerReward,
          currency: "AED",
          balance_before: referrerBalanceBefore,
          balance_after: referrer.wallet_balance,
          transaction_type: "reward",
          reference_type: "referral",
          reference_id: referral.id,
          description: "Referral reward — referred user completed first purchase",
        }),
      );
    }

    // Award referred user
    const referredUser = await this.userRepo.findOne({ where: { id: userId } });
    if (referredUser) {
      const referredBalanceBefore = referredUser.wallet_balance;
      referredUser.wallet_balance += referredReward;
      await this.userRepo.save(referredUser);

      await this.walletTxRepo.save(
        this.walletTxRepo.create({
          user_id: userId,
          amount: referredReward,
          currency: "AED",
          balance_before: referredBalanceBefore,
          balance_after: referredUser.wallet_balance,
          transaction_type: "reward",
          reference_type: "referral",
          reference_id: referral.id,
          description: "Welcome credit — referral signup reward",
        }),
      );
    }

    // Update referral status
    referral.status = "rewarded";
    referral.qualifying_order_id = orderId;
    referral.referrer_reward_amount = referrerReward;
    referral.referred_reward_amount = referredReward;
    referral.rewarded_at = new Date();
    await this.referralRepo.save(referral);
  }
}
