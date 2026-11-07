// review.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { ReviewStatus } from "@materialhub/database/src/enums/product.enums.ts";
import { REVIEW_FLAG_HIDE_THRESHOLD, ReviewService } from "./review.service.ts";

/* ------------------------------------------------------------------ */
/*  Helper: chainable query-builder mock                              */
/* ------------------------------------------------------------------ */
const makeQb = (resolvedValue: [any[], number] = [[], 0]) => {
  const qb: any = {
    leftJoinAndSelect: mock(() => qb),
    leftJoin: mock(() => qb),
    addSelect: mock(() => qb),
    innerJoinAndSelect: mock(() => qb),
    where: mock(() => qb),
    andWhere: mock(() => qb),
    orderBy: mock(() => qb),
    skip: mock(() => qb),
    take: mock(() => qb),
    getOne: mock(() => Promise.resolve(null)),
    getMany: mock(() => Promise.resolve([])),
    getManyAndCount: mock(() => Promise.resolve(resolvedValue)),
    select: mock(() => qb),
    groupBy: mock(() => qb),
    getRawMany: mock(() => Promise.resolve([])),
    insert: mock(() => qb),
    values: mock(() => qb),
    orIgnore: mock(() => qb),
    execute: mock(() => Promise.resolve({})),
  };
  return qb;
};

/* ------------------------------------------------------------------ */
/*  Shared mock factories                                             */
/* ------------------------------------------------------------------ */
const makeMockRepo = (extras: Record<string, any> = {}) => ({
  findOne: mock(() => Promise.resolve(null)),
  find: mock(() => Promise.resolve([])),
  count: mock(() => Promise.resolve(0)),
  create: mock((data: any) => ({ ...data })),
  save: mock((entity: any) => Promise.resolve({ id: "new-id", ...entity })),
  update: mock(() => Promise.resolve({})),
  delete: mock(() => Promise.resolve({})),
  createQueryBuilder: mock(() => makeQb()),
  query: mock(() => Promise.resolve([])),
  ...extras,
});

/* ------------------------------------------------------------------ */
/*  Test suite                                                        */
/* ------------------------------------------------------------------ */
describe("ReviewService", () => {
  let reviewRepo: any;
  let reviewVoteRepo: any;
  let orderItemRepo: any;
  let productRepo: any;
  let vendorRepo: any;
  let reviewRatingQueue: any;
  let reviewFlagRepo: any;
  let service: ReviewService;

  beforeEach(() => {
    reviewRepo = makeMockRepo();
    reviewVoteRepo = makeMockRepo();
    orderItemRepo = makeMockRepo();
    productRepo = makeMockRepo();
    vendorRepo = makeMockRepo();
    reviewRatingQueue = {
      add: mock(() => Promise.resolve()),
    };
    reviewFlagRepo = makeMockRepo();

    service = new ReviewService(
      reviewRepo,
      reviewVoteRepo,
      orderItemRepo,
      productRepo,
      vendorRepo,
      reviewRatingQueue,
      reviewFlagRepo,
    );
  });

  /* ================================================================ */
  /*  createReview                                                    */
  /* ================================================================ */
  describe("createReview", () => {
    const userId = "user-1";
    const baseData = {
      order_item_id: "oi-1",
      rating: 5,
      title: "Great product",
      body: "Loved it!",
    };

    it("throws if order_item not found", async () => {
      orderItemRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.createReview(userId, baseData)).rejects.toThrow("Order item not found");
    });

    it("throws if vendor order is not delivered", async () => {
      orderItemRepo.findOne.mockResolvedValueOnce({
        id: "oi-1",
        vendorOrder: { status: OrderStatus.confirmed, vendor_id: "v-1" },
        order: { user_id: userId },
        product: { id: "p-1" },
      });

      await expect(service.createReview(userId, baseData)).rejects.toThrow(
        "Order must be delivered before reviewing",
      );
    });

    it("throws if order does not belong to user", async () => {
      orderItemRepo.findOne.mockResolvedValueOnce({
        id: "oi-1",
        vendorOrder: { status: OrderStatus.delivered, vendor_id: "v-1" },
        order: { user_id: "other-user" },
        product: { id: "p-1" },
      });

      await expect(service.createReview(userId, baseData)).rejects.toThrow(
        "Order does not belong to user",
      );
    });

    it("rejects a review for a line that was cancelled in full", async () => {
      orderItemRepo.findOne.mockResolvedValueOnce({
        id: "oi-1",
        status: OrderStatus.cancelled,
        quantity: 1,
        refunded_quantity: 1,
        vendorOrder: { status: OrderStatus.delivered, vendor_id: "v-1" },
        order: { user_id: userId },
        product: { id: "p-1" },
      });

      await expect(service.createReview(userId, baseData)).rejects.toThrow(
        "This item was cancelled and cannot be reviewed",
      );
      expect(reviewRepo.save).not.toHaveBeenCalled();
    });

    it("throws if review already exists for order item", async () => {
      orderItemRepo.findOne.mockResolvedValueOnce({
        id: "oi-1",
        vendorOrder: { status: OrderStatus.delivered, vendor_id: "v-1" },
        order: { user_id: userId },
        product: { id: "p-1" },
      });
      reviewRepo.findOne.mockResolvedValueOnce({ id: "existing-review" });

      await expect(service.createReview(userId, baseData)).rejects.toThrow(
        "Review already exists for this order item",
      );
    });

    it("creates review and marks order item as reviewed", async () => {
      const orderItem = {
        id: "oi-1",
        variant_id: "var-1",
        is_reviewed: false,
        vendorOrder: { status: OrderStatus.delivered, vendor_id: "v-1" },
        order: { user_id: userId },
        product: { id: "p-1" },
      };
      orderItemRepo.findOne.mockResolvedValueOnce(orderItem);
      reviewRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.createReview(userId, baseData);

      // Verify review fields
      expect(result.product_id).toBe("p-1");
      expect(result.vendor_id).toBe("v-1");
      expect(result.user_id).toBe(userId);
      expect(result.order_item_id).toBe("oi-1");
      expect(result.variant_id).toBe("var-1");
      expect(result.rating).toBe(5);
      expect(result.is_verified_purchase).toBe(true);
      expect(result.status).toBe(ReviewStatus.pending);

      // Verify order item marked as reviewed
      expect(orderItem.is_reviewed).toBe(true);
      expect(orderItemRepo.save).toHaveBeenCalledWith(orderItem);
    });
  });

  /* ================================================================ */
  /*  vendorReply                                                     */
  /* ================================================================ */
  describe("vendorReply", () => {
    it("throws if review does not belong to vendor", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        vendor_id: "v-other",
        vendor_reply: null,
      });

      await expect(service.vendorReply("r-1", "v-1", "Thanks!")).rejects.toThrow(
        "Review does not belong to this vendor",
      );
    });

    it("throws if vendor has already replied", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        vendor_id: "v-1",
        vendor_reply: "Already replied",
      });

      await expect(service.vendorReply("r-1", "v-1", "Another reply")).rejects.toThrow(
        "Vendor has already replied to this review",
      );
    });

    it("sets vendor_reply and vendor_replied_at", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        vendor_id: "v-1",
        vendor_reply: null,
      });

      const result = await service.vendorReply("r-1", "v-1", "Thank you!");

      expect(result.vendor_reply).toBe("Thank you!");
      expect(result.vendor_replied_at).toBeDefined();
    });
  });

  /* ================================================================ */
  /*  voteReview                                                      */
  /* ================================================================ */
  describe("voteReview", () => {
    it("inserts new vote and recomputes counts", async () => {
      reviewVoteRepo.query
        .mockResolvedValueOnce(undefined) // upsert
        .mockResolvedValueOnce([{ helpful: "3", not_helpful: "1" }]); // recompute

      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        helpful_count: 0,
        not_helpful_count: 0,
      });

      const result = await service.voteReview("r-1", "user-1", true);

      expect(reviewVoteRepo.query).toHaveBeenCalledTimes(2);
      expect(result.helpful_count).toBe(3);
      expect(result.not_helpful_count).toBe(1);
    });

    it("forbids the author from voting on their own review (403, nothing written)", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({ id: "r-1", user_id: "user-1" });
      await expect(service.voteReview("r-1", "user-1", true)).rejects.toMatchObject({
        statusCode: 403,
        message: "You cannot vote on your own review",
      });
      expect(reviewVoteRepo.query).not.toHaveBeenCalled();
    });
  });

  /* ================================================================ */
  /*  flagReview                                                      */
  /* ================================================================ */
  describe("flagReview", () => {
    const approved = () => ({
      id: "r-1",
      user_id: "author-1",
      product_id: "p-1",
      vendor_id: "v-1",
      status: ReviewStatus.approved,
    });

    it("a single report records the flag but keeps the review published", async () => {
      reviewRepo.findOne.mockResolvedValueOnce(approved());
      const flagQb = makeQb();
      reviewFlagRepo.createQueryBuilder.mockReturnValueOnce(flagQb);
      reviewFlagRepo.count.mockResolvedValueOnce(1);

      const result = await service.flagReview("r-1", "user-1", "Mentions a competitor");

      expect(result).toEqual({
        id: "r-1",
        status: ReviewStatus.approved,
        flag_count: 1,
        hidden: false,
      });
      expect(flagQb.values).toHaveBeenCalledWith({
        review_id: "r-1",
        user_id: "user-1",
        reason: "Mentions a competitor",
      });
      // Duplicate reports from the same buyer are ignored, not double counted.
      expect(flagQb.orIgnore).toHaveBeenCalled();
      expect(reviewRepo.save).not.toHaveBeenCalled();
      expect(reviewRatingQueue.add).not.toHaveBeenCalled();
    });

    it(`hides the review once ${REVIEW_FLAG_HIDE_THRESHOLD} distinct buyers report it`, async () => {
      reviewRepo.findOne.mockResolvedValueOnce(approved());
      reviewFlagRepo.count.mockResolvedValueOnce(REVIEW_FLAG_HIDE_THRESHOLD);

      const result = await service.flagReview("r-1", "user-3");

      expect(result.status).toBe(ReviewStatus.flagged);
      expect(result.hidden).toBe(true);
      expect(reviewRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReviewStatus.flagged }),
      );
      // Hidden reviews leave the averages.
      expect(reviewRatingQueue.add).toHaveBeenCalledWith(
        "review.flagged",
        expect.objectContaining({ productId: "p-1", vendorId: "v-1" }),
      );
    });

    it("the author cannot flag their own review", async () => {
      reviewRepo.findOne.mockResolvedValueOnce(approved());
      await expect(service.flagReview("r-1", "author-1")).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("flagging an already hidden review is a no-op", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({ ...approved(), status: ReviewStatus.flagged });
      reviewFlagRepo.count.mockResolvedValueOnce(4);
      const result = await service.flagReview("r-1", "user-9");
      expect(result).toMatchObject({ status: ReviewStatus.flagged, hidden: true, flag_count: 4 });
      expect(reviewFlagRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it("throws if review is not approved", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        status: ReviewStatus.pending,
      });

      await expect(service.flagReview("r-1", "user-1")).rejects.toThrow(
        "Only approved reviews can be flagged",
      );
    });
  });

  /* ================================================================ */
  /*  approveReview                                                   */
  /* ================================================================ */
  describe("approveReview", () => {
    it("transitions pending to approved and enqueues rating job", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        status: ReviewStatus.pending,
        product_id: "p-1",
        vendor_id: "v-1",
      });

      const result = await service.approveReview("r-1", "admin-1");

      expect(result.status).toBe(ReviewStatus.approved);
      expect(result.approved_at).toBeDefined();
      expect(result.approved_by).toBe("admin-1");

      expect(reviewRatingQueue.add).toHaveBeenCalledWith(
        "review.approved",
        expect.objectContaining({
          reviewId: expect.any(String),
          productId: "p-1",
          vendorId: "v-1",
        }),
      );
    });

    it("transitions flagged to approved", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        status: ReviewStatus.flagged,
        product_id: "p-1",
        vendor_id: "v-1",
      });

      const result = await service.approveReview("r-1", "admin-1");

      expect(result.status).toBe(ReviewStatus.approved);
      // Restoring a hidden review clears its reports.
      expect(reviewFlagRepo.delete).toHaveBeenCalledWith({ review_id: "r-1" });
    });

    it("approving a published review with reports keeps it and dismisses the reports", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({ id: "r-1", status: ReviewStatus.approved });
      reviewFlagRepo.count.mockResolvedValueOnce(2);

      const result = await service.approveReview("r-1", "admin-1");

      expect(result.status).toBe(ReviewStatus.approved);
      expect(reviewFlagRepo.delete).toHaveBeenCalledWith({ review_id: "r-1" });
      expect(reviewRepo.save).not.toHaveBeenCalled();
    });

    it("throws if review is already approved and nobody reported it", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        status: ReviewStatus.approved,
      });

      await expect(service.approveReview("r-1", "admin-1")).rejects.toThrow(
        "Review is already approved",
      );
    });
  });

  /* ================================================================ */
  /*  rejectReview                                                    */
  /* ================================================================ */
  describe("rejectReview", () => {
    it("transitions pending to rejected with reason", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        status: ReviewStatus.pending,
      });

      const result = await service.rejectReview("r-1", "admin-1", "Inappropriate content");

      expect(result.status).toBe(ReviewStatus.rejected);
      expect(result.rejection_reason).toBe("Inappropriate content");
    });

    it("transitions flagged to rejected", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        status: ReviewStatus.flagged,
      });

      const result = await service.rejectReview("r-1", "admin-1", "Spam");

      expect(result.status).toBe(ReviewStatus.rejected);
    });

    it("throws if review is already rejected", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        status: ReviewStatus.rejected,
      });

      await expect(service.rejectReview("r-1", "admin-1", "reason")).rejects.toThrow(
        "Only pending, flagged or reported reviews can be rejected",
      );
    });

    it("requires a non-blank reason (400)", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({ id: "r-1", status: ReviewStatus.pending });
      await expect(service.rejectReview("r-1", "admin-1", "   ")).rejects.toMatchObject({
        statusCode: 400,
        message: "A rejection reason is required",
      });
    });

    it("takes down a reported published review and recalculates ratings", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({
        id: "r-1",
        status: ReviewStatus.approved,
        product_id: "p-1",
        vendor_id: "v-1",
      });
      reviewFlagRepo.count.mockResolvedValueOnce(1);

      const result = await service.rejectReview("r-1", "admin-1", "Off-topic: about a courier");

      expect(result.status).toBe(ReviewStatus.rejected);
      expect(reviewRatingQueue.add).toHaveBeenCalledWith(
        "review.rejected",
        expect.objectContaining({ productId: "p-1" }),
      );
    });

    it("cannot reject a published review nobody reported", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({ id: "r-1", status: ReviewStatus.approved });
      reviewFlagRepo.count.mockResolvedValueOnce(0);
      await expect(service.rejectReview("r-1", "admin-1", "x")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  /* ================================================================ */
  /*  getProductReviews                                               */
  /* ================================================================ */
  describe("getProductReviews", () => {
    it("selects only the reviewer's display fields (public endpoint)", async () => {
      const qb = makeQb([[], 0]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      await service.getProductReviews("p-1", {});

      expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
      expect(qb.leftJoin).toHaveBeenCalledWith("review.user", "user");
      const selected = qb.addSelect.mock.calls[0]?.[0] as string[];
      expect(selected).toEqual(["user.id", "user.first_name", "user.last_name", "user.avatar_url"]);
      expect(selected).not.toContain("user.password_hash");
      expect(selected).not.toContain("user.email");
    });

    it("only returns approved reviews", async () => {
      const reviews = [{ id: "r-1", status: ReviewStatus.approved, rating: 5 }];
      const qb = makeQb([reviews, 1]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      const result = await service.getProductReviews("p-1", { page: 1 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(qb.andWhere).toHaveBeenCalledWith("review.status = :status", {
        status: ReviewStatus.approved,
      });
    });

    it("applies rating filter when provided", async () => {
      const qb = makeQb([[], 0]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      await service.getProductReviews("p-1", { rating: 4 });

      // andWhere called twice: once for status, once for rating
      expect(qb.andWhere).toHaveBeenCalledTimes(2);
    });

    it("sorts by rating DESC for highest", async () => {
      const qb = makeQb([[], 0]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      await service.getProductReviews("p-1", { sort: "highest" });

      expect(qb.orderBy).toHaveBeenCalledWith("review.rating", "DESC");
    });

    it("sorts by rating ASC for lowest", async () => {
      const qb = makeQb([[], 0]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      await service.getProductReviews("p-1", { sort: "lowest" });

      expect(qb.orderBy).toHaveBeenCalledWith("review.rating", "ASC");
    });
  });

  /* ================================================================ */
  /*  listForAdmin                                                    */
  /* ================================================================ */
  describe("listForAdmin", () => {
    it("returns paginated reviews", async () => {
      const reviews = [{ id: "r-1" }, { id: "r-2" }];
      const qb = makeQb([reviews, 2]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      const result = await service.listForAdmin({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("returns product, vendor and reviewer names plus the report count", async () => {
      const qb = makeQb([
        [
          {
            id: "r-1",
            product_id: "p-1",
            vendor_id: "v-1",
            user_id: "u-1",
            rating: 2,
            body: "Lids pop off 80 mm cups",
            status: ReviewStatus.approved,
            created_at: new Date("2026-11-07"),
            product: { name: "Paperboard sip lid, 80 mm", slug: "paperboard-sip-lid-80mm" },
            vendor: { name: "Gulf Board Supply" },
            user: { first_name: "Mariam", last_name: "Haddad", email: "m@buyer.test" },
          },
        ],
        1,
      ]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);
      const flagQb = makeQb();
      flagQb.getRawMany.mockResolvedValueOnce([{ review_id: "r-1", count: "2" }]);
      reviewFlagRepo.createQueryBuilder.mockReturnValueOnce(flagQb);

      const { data, total } = await service.listForAdmin({});

      expect(total).toBe(1);
      expect(data[0]).toMatchObject({
        product_name: "Paperboard sip lid, 80 mm",
        vendor_name: "Gulf Board Supply",
        reviewer_name: "Mariam Haddad",
        flag_count: 2,
      });
      expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
    });

    it("needs_moderation = pending + flagged + published-but-reported", async () => {
      const qb = makeQb([[], 0]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      await service.listForAdmin({ status: "needs_moderation" });

      const [clause, params] = qb.andWhere.mock.calls[0];
      expect(clause).toContain("review_flags");
      expect(params).toEqual({
        queue: [ReviewStatus.pending, ReviewStatus.flagged],
        approved: ReviewStatus.approved,
      });
    });

    it("filters by status when provided", async () => {
      const qb = makeQb([[], 0]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      await service.listForAdmin({ status: ReviewStatus.pending });

      expect(qb.andWhere).toHaveBeenCalledWith("review.status = :status", {
        status: ReviewStatus.pending,
      });
    });

    it("filters by product_id when provided", async () => {
      const qb = makeQb([[], 0]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      await service.listForAdmin({ product_id: "p-1" });

      expect(qb.andWhere).toHaveBeenCalledWith("review.product_id = :productId", {
        productId: "p-1",
      });
    });

    it("filters by vendor_id when provided", async () => {
      const qb = makeQb([[], 0]);
      reviewRepo.createQueryBuilder.mockReturnValueOnce(qb);

      await service.listForAdmin({ vendor_id: "v-1" });

      expect(qb.andWhere).toHaveBeenCalledWith("review.vendor_id = :vendorId", { vendorId: "v-1" });
    });
  });

  /* ================================================================ */
  /*  Unknown ids → 404 (was a plain Error → 500)                     */
  /* ================================================================ */
  describe("unknown review id", () => {
    it.each([
      ["approveReview", (svc: ReviewService) => svc.approveReview("missing", "admin-1")],
      ["rejectReview", (svc: ReviewService) => svc.rejectReview("missing", "admin-1", "spam")],
      ["flagReview", (svc: ReviewService) => svc.flagReview("missing", "user-1")],
      ["vendorReply", (svc: ReviewService) => svc.vendorReply("missing", "v-1", "Thanks")],
      ["voteReview", (svc: ReviewService) => svc.voteReview("missing", "user-1", true)],
    ])("%s rejects with a 404 NotFoundError", async (_name, call) => {
      reviewRepo.findOne.mockResolvedValueOnce(null);
      await expect(call(service)).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    });

    it("voteReview checks existence before writing the vote (no FK violation)", async () => {
      reviewRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.voteReview("missing", "user-1", true)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(reviewVoteRepo.query).not.toHaveBeenCalled();
    });

    it("an invalid state transition is a 400, not a 500", async () => {
      reviewRepo.findOne.mockResolvedValueOnce({ id: "r-1", status: ReviewStatus.pending });
      await expect(service.flagReview("r-1", "user-1")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });
});
