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
  /**
   * Public (guest-readable) product reviews. Mapped to an explicit shape so
   * internal ids and moderation fields (user_id, order_item_id, approved_by,
   * rejection_reason, status, ...) never leave the server.
   */
  async listForProduct(productId: string, query: any) {
    const { data, total } = await this.reviewService.getProductReviews(productId, query);
    return { data: data.map(toPublicReview), total };
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
    const review: any = await this.reviewService.voteReview(reviewId, userId, isHelpful);
    // The voter only needs the new tallies, not the review row.
    return {
      id: review.id,
      helpful_count: review.helpful_count ?? 0,
      not_helpful_count: review.not_helpful_count ?? 0,
    };
  }

  async flag(reviewId: string, userId: string, reason?: string) {
    return this.reviewService.flagReview(reviewId, userId, reason);
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

/** Fields a guest may see for an approved review. */
export function toPublicReview(r: any) {
  return {
    id: r.id,
    product_id: r.product_id,
    variant_id: r.variant_id ?? null,
    rating: r.rating,
    quality_rating: r.quality_rating ?? null,
    value_rating: r.value_rating ?? null,
    shipping_rating: r.shipping_rating ?? null,
    title: r.title ?? null,
    body: r.body ?? null,
    media_urls: r.media_urls ?? [],
    is_verified_purchase: r.is_verified_purchase ?? false,
    is_featured: r.is_featured ?? false,
    helpful_count: r.helpful_count ?? 0,
    not_helpful_count: r.not_helpful_count ?? 0,
    vendor_reply: r.vendor_reply ?? null,
    vendor_replied_at: r.vendor_replied_at ?? null,
    created_at: r.created_at,
    user: r.user
      ? {
          first_name: r.user.first_name ?? null,
          last_name: r.user.last_name ?? null,
          avatar_url: r.user.avatar_url ?? null,
        }
      : null,
  };
}
