import type { ReviewService } from "./review.service.ts";

export class ReviewController {
  constructor(private reviewService: ReviewService) {}

  async create(userId: string, body: any) {
    return this.reviewService.createReview(userId, body);
  }

  async getProductReviews(productId: string, query: any) {
    return this.reviewService.getProductReviews(productId, query);
  }

  /** GET /products/:id/reviews (the route's name for getProductReviews). */
  async listForProduct(productId: string, query: any) {
    return this.reviewService.getProductReviews(productId, query);
  }

  async vendorReply(reviewId: string, vendorId: string, body: any) {
    return this.reviewService.vendorReply(reviewId, vendorId, body.reply);
  }

  /** PATCH /vendors/me/reviews/:id/reply — route passes the reply string. */
  async reply(reviewId: string, vendorId: string, reply: string) {
    return this.reviewService.vendorReply(reviewId, vendorId, reply);
  }

  /** Route passes the already-validated boolean, not the body. */
  async vote(reviewId: string, userId: string, isHelpful: boolean) {
    return this.reviewService.voteReview(reviewId, userId, isHelpful);
  }

  async flag(reviewId: string, userId: string) {
    return this.reviewService.flagReview(reviewId, userId);
  }

  async approve(reviewId: string, adminId: string) {
    return this.reviewService.approveReview(reviewId, adminId);
  }

  async reject(reviewId: string, adminId: string, body: any) {
    return this.reviewService.rejectReview(reviewId, adminId, body.rejection_reason);
  }

  async listForAdmin(query: any) {
    return this.reviewService.listForAdmin(query);
  }
}
