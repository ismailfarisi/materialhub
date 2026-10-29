import type { RecommendationService } from "./recommendation.service.ts";

export class RecommendationController {
  constructor(private readonly service: RecommendationService) {}

  async youMightAlsoLike(productId: string) {
    return this.service.youMightAlsoLike(productId);
  }
  async forUser(userId: string, limit?: number) {
    return this.service.forUser(userId, limit);
  }
  async moreFromBrand(productId: string, limit?: number) {
    return this.service.moreFromBrand(productId, limit);
  }
  async pairsWith(productId: string, limit?: number) {
    return this.service.pairsWith(productId, limit);
  }
  async crossBrand(productId: string, limit?: number) {
    return this.service.crossBrand(productId, limit);
  }
  async bestsellersInCategory(productId: string, limit?: number) {
    return this.service.bestsellersInCategory(productId, limit);
  }
}
