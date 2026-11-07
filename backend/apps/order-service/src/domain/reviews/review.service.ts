import type {
  OrderItem,
  Product,
  Review,
  ReviewFlag,
  ReviewVote,
  Vendor,
} from "@materialhub/database";
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
  /**
   * A ReviewStatus, or one of the queue views:
   *  - `needs_moderation`: pending + flagged + approved-but-reported
   *  - `reported`: any review with at least one buyer report
   */
  status?: string;
  product_id?: string;
  vendor_id?: string;
}

/**
 * Distinct buyers who must report an approved review before it is hidden
 * (status `flagged`). Below this it stays published and only surfaces in the
 * admin moderation queue, so one competitor or one unhappy reader cannot take
 * a review down on their own.
 */
export const REVIEW_FLAG_HIDE_THRESHOLD = 3;

/** Row shape of GET /admin/reviews. */
export interface AdminReviewRow {
  id: string;
  product_id: string;
  product_name: string | null;
  product_slug: string | null;
  vendor_id: string;
  vendor_name: string | null;
  user_id: string;
  reviewer_name: string | null;
  reviewer_email: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  flag_count: number;
  rejection_reason: string | null;
  is_verified_purchase: boolean;
  helpful_count: number;
  created_at: Date;
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
    private reviewFlagRepo?: Repository<ReviewFlag>,
  ) {}

  private get flags(): Repository<ReviewFlag> {
    // Wired in container.ts; optional only so older test fixtures that build
    // the service positionally keep compiling.
    if (!this.reviewFlagRepo) throw new Error("ReviewService: reviewFlagRepo is not wired");
    return this.reviewFlagRepo;
  }

  private enqueueRatingRecalc(review: any, reason: string) {
    return this.reviewRatingQueue.add(reason, {
      reviewId: review.id,
      productId: review.product_id,
      vendorId: review.vendor_id,
    });
  }

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
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
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
    if ((review as any).user_id === userId) {
      throw new ForbiddenError("You cannot vote on your own review");
    }

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
  async flagReview(
    reviewId: string,
    userId: string,
    reason?: string,
  ): Promise<{ id: string; status: string; flag_count: number; hidden: boolean }> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId } as any,
    });
    if (!review) throw new NotFoundError("Review not found");

    const status = (review as any).status;
    if (status === ReviewStatus.flagged) {
      // Already hidden and waiting for a moderator — nothing more to do.
      const flagCount = await this.flags.count({ where: { review_id: reviewId } as any });
      return { id: reviewId, status, flag_count: flagCount, hidden: true };
    }
    if (status !== ReviewStatus.approved) {
      throw new BadRequestError("Only approved reviews can be flagged");
    }
    if ((review as any).user_id === userId) {
      throw new ForbiddenError("You cannot flag your own review");
    }

    // One report per buyer: a repeat click is a no-op, not a second vote.
    await this.flags
      .createQueryBuilder()
      .insert()
      .values({ review_id: reviewId, user_id: userId, reason: reason?.trim() || null } as any)
      .orIgnore()
      .execute();
    const flagCount = await this.flags.count({ where: { review_id: reviewId } as any });

    if (flagCount < REVIEW_FLAG_HIDE_THRESHOLD) {
      return { id: reviewId, status, flag_count: flagCount, hidden: false };
    }

    (review as any).status = ReviewStatus.flagged;
    await this.reviewRepo.save(review);
    // Hidden reviews drop out of the product and vendor averages.
    await this.enqueueRatingRecalc(review, "review.flagged");
    return { id: reviewId, status: ReviewStatus.flagged, flag_count: flagCount, hidden: true };
  }

  /* ================================================================ */
  /*  approveReview                                                   */
  /* ================================================================ */
  /**
   * Approve a pending or flagged review, or — for a published review buyers
   * have reported — keep it published and dismiss the reports. Either way the
   * reports are cleared, so it leaves the moderation queue.
   */
  async approveReview(reviewId: string, adminId: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId } as any,
    });
    if (!review) throw new NotFoundError("Review not found");

    const status = (review as any).status;
    if (status === ReviewStatus.approved) {
      const reported = await this.flags.count({ where: { review_id: reviewId } as any });
      if (reported === 0) {
        throw new BadRequestError("Review is already approved");
      }
      await this.flags.delete({ review_id: reviewId } as any);
      return review;
    }
    if (status !== ReviewStatus.pending && status !== ReviewStatus.flagged) {
      throw new BadRequestError("Only pending or flagged reviews can be approved");
    }

    (review as any).status = ReviewStatus.approved;
    (review as any).approved_at = new Date();
    (review as any).approved_by = adminId;

    const saved = await this.reviewRepo.save(review);
    if (status === ReviewStatus.flagged) {
      await this.flags.delete({ review_id: reviewId } as any);
    }

    // Enqueue rating recalculation
    await this.enqueueRatingRecalc(saved, "review.approved");

    return saved;
  }

  /* ================================================================ */
  /*  rejectReview                                                    */
  /* ================================================================ */
  /**
   * Reject a pending or flagged review, or take down a published one buyers
   * have reported. A previously published review leaves the averages.
   */
  async rejectReview(reviewId: string, _adminId: string, reason: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId } as any,
    });
    if (!review) throw new NotFoundError("Review not found");

    const trimmed = (reason ?? "").trim();
    if (!trimmed) throw new BadRequestError("A rejection reason is required");

    const status = (review as any).status;
    const reportedApproved =
      status === ReviewStatus.approved &&
      (await this.flags.count({ where: { review_id: reviewId } as any })) > 0;
    if (status !== ReviewStatus.pending && status !== ReviewStatus.flagged && !reportedApproved) {
      throw new BadRequestError("Only pending, flagged or reported reviews can be rejected");
    }

    (review as any).status = ReviewStatus.rejected;
    (review as any).rejection_reason = trimmed;

    const saved = await this.reviewRepo.save(review);
    if (reportedApproved) {
      await this.enqueueRatingRecalc(saved, "review.rejected");
    }
    return saved;
  }

  /* ================================================================ */
  /*  listForAdmin                                                    */
  /* ================================================================ */
  async listForAdmin(query: AdminListQuery): Promise<{ data: AdminReviewRow[]; total: number }> {
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const limit = query.limit || 20;

    // Display fields only from the joins — never the whole User row.
    const qb = this.reviewRepo
      .createQueryBuilder("review")
      .leftJoin("review.product", "product")
      .addSelect(["product.id", "product.name", "product.slug"])
      .leftJoin("review.vendor", "vendor")
      .addSelect(["vendor.id", "vendor.name"])
      .leftJoin("review.user", "user")
      .addSelect(["user.id", "user.first_name", "user.last_name", "user.email"])
      .orderBy("review.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const reported = "EXISTS (SELECT 1 FROM review_flags rf WHERE rf.review_id = review.id)";
    if (query.status === "needs_moderation") {
      qb.andWhere(`(review.status IN (:...queue) OR (review.status = :approved AND ${reported}))`, {
        queue: [ReviewStatus.pending, ReviewStatus.flagged],
        approved: ReviewStatus.approved,
      });
    } else if (query.status === "reported") {
      qb.andWhere(reported);
    } else if (query.status) {
      qb.andWhere("review.status = :status", { status: query.status });
    }
    if (query.product_id) {
      qb.andWhere("review.product_id = :productId", { productId: query.product_id });
    }
    if (query.vendor_id) {
      qb.andWhere("review.vendor_id = :vendorId", { vendorId: query.vendor_id });
    }

    const [rows, total] = await qb.getManyAndCount();

    const flagCounts = new Map<string, number>();
    if (rows.length > 0) {
      const counts = await this.flags
        .createQueryBuilder("rf")
        .select("rf.review_id", "review_id")
        .addSelect("COUNT(*)", "count")
        .where("rf.review_id IN (:...ids)", { ids: rows.map((r: any) => r.id) })
        .groupBy("rf.review_id")
        .getRawMany();
      for (const c of counts) flagCounts.set(c.review_id, Number(c.count) || 0);
    }

    return {
      data: rows.map((r) => toAdminReviewRow(r, flagCounts.get((r as any).id) ?? 0)),
      total,
    };
  }
}

export function toAdminReviewRow(r: any, flagCount: number): AdminReviewRow {
  const reviewer = r.user
    ? `${r.user.first_name ?? ""} ${r.user.last_name ?? ""}`.trim() || r.user.email || null
    : null;
  return {
    id: r.id,
    product_id: r.product_id,
    product_name: r.product?.name ?? null,
    product_slug: r.product?.slug ?? null,
    vendor_id: r.vendor_id,
    vendor_name: r.vendor?.name ?? null,
    user_id: r.user_id,
    reviewer_name: reviewer,
    reviewer_email: r.user?.email ?? null,
    rating: r.rating,
    title: r.title ?? null,
    body: r.body ?? null,
    status: r.status,
    flag_count: flagCount,
    rejection_reason: r.rejection_reason ?? null,
    is_verified_purchase: r.is_verified_purchase ?? false,
    helpful_count: r.helpful_count ?? 0,
    created_at: r.created_at,
  };
}
