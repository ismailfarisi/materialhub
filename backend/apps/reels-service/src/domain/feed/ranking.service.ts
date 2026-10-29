export interface RankingSignals {
  likeCount: number;
  saveCount: number;
  shareCount: number;
  tapCount: number;
  attributedPurchaseCount: number;
  publishedAt: Date;
  now: Date;
}

export class RankingService {
  computeScore(s: RankingSignals): number {
    const numerator =
      s.likeCount * 1 +
      s.saveCount * 2 +
      s.shareCount * 3 +
      s.tapCount * 3 +
      s.attributedPurchaseCount * 10;
    if (numerator === 0) return 0;
    const ageMs = s.now.getTime() - s.publishedAt.getTime();
    const ageHours = Math.max(0, ageMs / (1000 * 60 * 60));
    const denominator = (ageHours + 2) ** 1.5;
    return Number((numerator / denominator).toFixed(4));
  }
}
