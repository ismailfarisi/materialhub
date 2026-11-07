import type { OrderItem, Product, Review, ReviewVote, Vendor } from "@materialhub/database";
import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { ReviewStatus } from "@materialhub/database/src/enums/product.enums.ts";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@materialhub/plugins";
import type { Queue } from "bullmq";
// review.service.ts
import type { Repository } from "typeorm";

/* ------------------------------------------------------------------ */
/*  Input types                                                       */
/* ------------------------------------------------------------------ */
interface CreateReviewInput {
  order_item_id: string;
  rating: number;
  title?: string;
  body?: string;
  media_urls?: string[];
  quality_rating?: number;
  value_rating?: number;
  shipping_rating?: number;
}

interface ProductReviewsQuery {
  page?: number;
  limit?: number;
  sort?: "newest" | "highest" | "lowest" | "most_helpful";
  rating?: number;
}

interface AdminListQuery {
  page?: number;
  limit?: number;
  status?: string;
  product_id?: string;
  vendor_id?: string;
}

/* ------------------------------------------------------------------ */
/*  Service                                                           */
/* ------------------------------------------------------------------ */
export class ReviewService {
  constructor(
    private reviewRepo: Repository<Review>,
    private reviewVoteRepo: Repository<ReviewVote>,
    private orderItemRepo: Repository<OrderItem>,
    private productRepo: Repository<Product>,
    private vendorRepo: Repository<Vendor>,
    private reviewRatingQueue: Queue,
  ) {}

  /* ================================================================ */
  /*  createReview                                                    */
  /* ================================================================ */
  async createReview(userId: string, data: CreateReviewInput): Promise<Review> {
    // 1. Load order_item with relations
    const orderItem = await this.orderItemRepo.findOne({
      where: { id: data.order_item_id } as any,
      relations: ["vendorOrder", "order", "product"],
    });
    if (!orderItem) {
      throw new NotFoundError("Order item not found");
    }

    // 2. Verify vendor_order status is delivered and order belongs to user
    const vendorOrder = (orderItem as any).vendorOrder;
    const order = (orderItem as any).order;
    if (!vendorOrder || vendorOrder.status !== OrderStatus.delivered) {
      throw new BadRequestError("Order must be delivered before reviewing");
    }
    if (!order || order.user_id !== userId) {
      throw new ForbiddenError("Order does not belong to user");
    }

    // 3. Check no existing review for same order_item_id
    const existing = await this.reviewRepo.findOne({
      where: { order_item_id: data.order_item_id } as any,
    });
    if (existing) {
      throw new ConflictError("Review already exists for this order item");
    }

    // 4. Create review
    const product = (orderItem as any).product;
    const review = this.reviewRepo.create({
      product_id: product.id,
      vendor_id: vendorOrder.vendor_id,
      user_id: userId,
      order_item_id: data.order_item_id,
      variant_id: (orderItem as any).variant_id || null,
      rating: data.rating,
      title: data.title || null,
      body: data.body || null,
      media_urls: data.media_urls || [],
      quality_rating: data.quality_rating || null,
      value_rating: data.value_rating || null,
      shipping_rating: data.shipping_rating || null,
      is_verified_purchase: true,
      status: ReviewStatus.pending,
    } as any);
    const saved = (await this.reviewRepo.save(review)) as unknown as Review;

    // 5. Mark orderItem.is_reviewed = true
    (orderItem as any).is_reviewed = true;
    await this.orderItemRepo.save(orderItem);

    return saved;
  }

  /* ================================================================ */
  /*  getProductReviews                                               */
  /* ================================================================ */
  async getProductReviews(
    productId: string,
    query: ProductReviewsQuery,
  ): Promise<{ data: Review[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.reviewRepo
      .createQueryBuilder("review")
      // Public endpoint: select only the reviewer's display fields. A plain
      // leftJoinAndSelect would ship the whole User row (email, phone,
      // password_hash, wallet_balance, ...) to anonymous callers.
      .leftJoin("review.user", "user")
      .addSelect(["user.id", "user.first_name", "user.last_name", "user.avatar_url"])
      .where("review.product_id = :productId", { productId })
      .andWhere("review.status = :status", { status: ReviewStatus.approved })
      .skip((page - 1) * limit)
      .take(limit);

    if (query.rating) {
      qb.andWhere("review.rating = :rating", { rating: query.rating });
    }

    // Sort
    switch (query.sort) {
      case "highest":
        qb.orderBy("review.rating", "DESC");
        break;
      case "lowest":
        qb.orderBy("review.rating", "ASC");
        break;
      case "most_helpful":
        qb.orderBy("review.helpful_count", "DESC");
        break;
      default:
        qb.orderBy("review.created_at", "DESC");
        break;
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /* ================================================================ */
  /*  vendorReply                                                     */
  /* ================================================================ */
  async vendorReply(reviewId: string, vendorId: string, reply: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId } as any,
    });
    if (!review) throw new NotFoundError("Review not found");

    if ((review as any).vendor_id !== vendorId) {
      throw new ForbiddenError("Review does not belong to this vendor");
    }
    if ((review as any).vendor_reply != null) {
      throw new ConflictError("Vendor has already replied to this review");
    }

    (review as any).vendor_reply = reply;
    (review as any).vendor_replied_at = new Date();

    return this.reviewRepo.save(review);
  }

  /* ================================================================ */
  /*  voteReview                                                      */
  /* ================================================================ */
  async voteReview(reviewId: string, userId: string, isHelpful: boolean): Promise<Review> {
    // Existence first: an upsert against an unknown review_id hits the FK and
    // surfaces as a 500 instead of a 404.
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId } as any,
    });
    if (!review) throw new NotFoundError("Review not found");

    // Upsert vote
    await this.reviewVoteRepo.query(
      `INSERT INTO review_votes (review_id, user_id, is_helpful, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (review_id, user_id) DO UPDATE SET is_helpful = $3, updated_at = NOW()`,
      [reviewId, userId, isHelpful],
    );

    // Recompute counts
    const counts = await this.reviewVoteRepo.query(
      `SELECT
         COUNT(*) FILTER (WHERE is_helpful = true) AS helpful,
         COUNT(*) FILTER (WHERE is_helpful = false) AS not_helpful
       FROM review_votes WHERE review_id = $1`,
      [reviewId],
    );

    const helpfulCount = Number.parseInt(counts[0]?.helpful || "0", 10);
    const notHelpfulCount = Number.parseInt(counts[0]?.not_helpful || "0", 10);

    (review as any).helpful_count = helpfulCount;
    (review as any).not_helpful_count = notHelpfulCount;

    return this.reviewRepo.save(review);
  }

  /* ================================================================ */
  /*  flagReview                                                      */
  /* ================================================================ */
  async flagReview(reviewId: string, _userId: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId } as any,
    });
    if (!review) throw new NotFoundError("Review not found");

    if ((review as any).status !== ReviewStatus.approved) {
      throw new BadRequestError("Only approved reviews can be flagged");
    }

    (review as any).status = ReviewStatus.flagged;

    return this.reviewRepo.save(review);
  }

  /* ================================================================ */
  /*  approveReview                                                   */
  /* ================================================================ */
  async approveReview(reviewId: string, adminId: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId } as any,
    });
    if (!review) throw new NotFoundError("Review not found");

    const status = (review as any).status;
    if (status !== ReviewStatus.pending && status !== ReviewStatus.flagged) {
      throw new BadRequestError("Only pending or flagged reviews can be approved");
    }

    (review as any).status = ReviewStatus.approved;
    (review as any).approved_at = new Date();
    (review as any).approved_by = adminId;

    const saved = await this.reviewRepo.save(review);

    // Enqueue rating recalculation
    await this.reviewRatingQueue.add("review.approved", {
      reviewId: (saved as any).id,
      productId: (saved as any).product_id,
      vendorId: (saved as any).vendor_id,
    });

    return saved;
  }

  /* ================================================================ */
  /*  rejectReview                                                    */
  /* ================================================================ */
  async rejectReview(reviewId: string, _adminId: string, reason: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId } as any,
    });
    if (!review) throw new NotFoundError("Review not found");

    const status = (review as any).status;
    if (status !== ReviewStatus.pending && status !== ReviewStatus.flagged) {
      throw new BadRequestError("Only pending or flagged reviews can be rejected");
    }

    (review as any).status = ReviewStatus.rejected;
    (review as any).rejection_reason = reason;

    return this.reviewRepo.save(review);
  }

  /* ================================================================ */
  /*  listForAdmin                                                    */
  /* ================================================================ */
  async listForAdmin(query: AdminListQuery): Promise<{ data: Review[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.reviewRepo
      .createQueryBuilder("review")
      .orderBy("review.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("review.status = :status", { status: query.status });
    }
    if (query.product_id) {
      qb.andWhere("review.product_id = :productId", { productId: query.product_id });
    }
    if (query.vendor_id) {
      qb.andWhere("review.vendor_id = :vendorId", { vendorId: query.vendor_id });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
