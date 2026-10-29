import {
  ReelFeaturePlacement,
  ReelLicenseFundingSource,
  ReelLicenseRightsScope,
} from "@materialhub/database";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const PREFIX = "/vendor/reels/licensing";

/**
 * Read-only vendor licensing surface — listing offers/briefs/grants/balance and
 * reading events. Gated by `payouts.read` (owner, manager, viewer): viewing the
 * vendor's licensing/financial state is appropriate for read-capable members.
 */
const licensingVendorReadRoutes = new Elysia({ prefix: PREFIX })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("payouts.read"))
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/offers", async ({ member, licensingService }: any) => {
    const offers = await licensingService.listOffers(member.vid);
    return { statusCode: 200, data: offers, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/balance", async ({ member, licensingService }: any) => {
    const available_fils = await licensingService.availablePayoutBalance(member.vid);
    return { statusCode: 200, data: { available_fils }, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/offers/:id/events", async ({ params, member, licensingService }: any) => {
    const offer = await licensingService.getOffer(params.id);
    if (!offer || offer.vendor_id !== member.vid) {
      return { statusCode: 404, data: null, timestamp: new Date().toISOString() };
    }
    const events = await licensingService.listEvents(params.id);
    return { statusCode: 200, data: events, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/grants", async ({ member, rightsService }: any) => {
    const grants = await rightsService.listGrants(member.vid);
    return { statusCode: 200, data: grants, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/grants/:id/features", async ({ params, member, rightsService }: any) => {
    const features = await rightsService.listFeaturesForGrant(member.vid, params.id);
    return { statusCode: 200, data: features, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/briefs", async ({ member, briefService }: any) => {
    const briefs = await briefService.listBriefsForVendor(member.vid);
    return { statusCode: 200, data: briefs, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/briefs/:id", async ({ params, member, briefService }: any) => {
    const brief = await briefService.getBrief(params.id);
    if (brief.vendor_id !== member.vid) {
      return {
        statusCode: 403,
        data: { error: "not_your_brief" },
        timestamp: new Date().toISOString(),
      };
    }
    const bids = await briefService.listBids(member.vid, params.id);
    return { statusCode: 200, data: { brief, bids }, timestamp: new Date().toISOString() };
  });

/**
 * Mutating vendor licensing surface — creating/cancelling offers and briefs,
 * accepting bids, approving deliveries, and pinning/downloading licensed reels.
 * Gated by `bank.read` (owner, manager only — NOT viewer/staff): these actions
 * commit or move vendor funds and manage paid licensing deals, so they require a
 * finance-trusted role. (`payouts.read`/`analytics.read` are held by viewers, so
 * they would not gate fund-committing actions.)
 */
const licensingVendorWriteRoutes = new Elysia({ prefix: PREFIX })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("bank.read"))
  .post(
    "/offers",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ body, member, licensingService }: any) => {
      const offer = await licensingService.createOffer({
        vendorId: member.vid,
        reelId: body.reel_id,
        amountFils: body.amount_fils,
        rightsScope: body.rights_scope,
        fundingSource: body.funding_source,
        message: body.message ?? null,
        paymentMethodId: body.payment_method_id,
      });
      return { statusCode: 201, data: offer, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        reel_id: t.String(),
        amount_fils: t.Integer({ minimum: 1 }),
        rights_scope: t.Enum(ReelLicenseRightsScope),
        funding_source: t.Enum(ReelLicenseFundingSource),
        message: t.Optional(t.String()),
        payment_method_id: t.Optional(t.String()),
      }),
    },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/offers/:id/cancel", async ({ params, member, licensingService }: any) => {
    await licensingService.cancelOffer(member.vid, params.id);
    return { statusCode: 200, data: { cancelled: true }, timestamp: new Date().toISOString() };
  })
  .post(
    "/offers/:id/accept-counter",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, licensingService }: any) => {
      const grant = await licensingService.acceptCounter(
        member.vid,
        params.id,
        body?.payment_method_id,
      );
      return { statusCode: 200, data: grant, timestamp: new Date().toISOString() };
    },
    { body: t.Optional(t.Object({ payment_method_id: t.Optional(t.String()) })) },
  )
  .post(
    "/offers/:id/re-offer",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, licensingService }: any) => {
      const offer = await licensingService.reOffer(
        member.vid,
        params.id,
        body.amount_fils,
        body.payment_method_id,
      );
      return { statusCode: 200, data: offer, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        amount_fils: t.Integer({ minimum: 1 }),
        payment_method_id: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/grants/:id/feature",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, rightsService }: any) => {
      const feature = await rightsService.pinFeature(member.vid, params.id, {
        placement: body.placement,
        productId: body.product_id ?? null,
        position: body.position,
      });
      return { statusCode: 201, data: feature, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        placement: t.Enum(ReelFeaturePlacement),
        product_id: t.Optional(t.String()),
        position: t.Optional(t.Integer()),
      }),
    },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .delete("/features/:featureId", async ({ params, member, rightsService }: any) => {
    await rightsService.unpinFeature(member.vid, params.featureId);
    return { statusCode: 200, data: { unpinned: true }, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/grants/:id/download", async ({ params, member, rightsService }: any) => {
    const res = await rightsService.requestDownload(member.vid, params.id);
    return { statusCode: 200, data: res, timestamp: new Date().toISOString() };
  })
  .post(
    "/briefs",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ body, member, briefService }: any) => {
      const brief = await briefService.createBrief({
        vendorId: member.vid,
        title: body.title,
        brief: body.brief,
        rightsScope: body.rights_scope,
        bidsCloseAt: new Date(body.bids_close_at),
        budgetGuideFils: body.budget_guide_fils ?? null,
        targetProductId: body.target_product_id ?? null,
        targetCategory: body.target_category ?? null,
      });
      return { statusCode: 201, data: brief, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        title: t.String(),
        brief: t.String(),
        rights_scope: t.Enum(ReelLicenseRightsScope),
        bids_close_at: t.String(),
        budget_guide_fils: t.Optional(t.Integer()),
        target_product_id: t.Optional(t.String()),
        target_category: t.Optional(t.String()),
      }),
    },
  )
  .patch(
    "/briefs/:id",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, briefService }: any) => {
      const brief = await briefService.updateBrief(member.vid, params.id, {
        title: body.title,
        brief: body.brief,
        bidsCloseAt: body.bids_close_at ? new Date(body.bids_close_at) : undefined,
        budgetGuideFils: body.budget_guide_fils,
        targetProductId: body.target_product_id,
        targetCategory: body.target_category,
      });
      return { statusCode: 200, data: brief, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
        brief: t.Optional(t.String()),
        bids_close_at: t.Optional(t.String()),
        budget_guide_fils: t.Optional(t.Integer()),
        target_product_id: t.Optional(t.String()),
        target_category: t.Optional(t.String()),
      }),
    },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/briefs/:id/cancel", async ({ params, member, briefService }: any) => {
    await briefService.cancelBrief(member.vid, params.id);
    return { statusCode: 200, data: { cancelled: true }, timestamp: new Date().toISOString() };
  })
  .post(
    "/briefs/:id/bids/:bidId/accept",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, briefService }: any) => {
      const bid = await briefService.acceptBid(
        member.vid,
        params.id,
        params.bidId,
        body.funding_source,
        body.payment_method_id,
      );
      return { statusCode: 200, data: bid, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        funding_source: t.Enum(ReelLicenseFundingSource),
        payment_method_id: t.Optional(t.String()),
      }),
    },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/briefs/:id/bids/:bidId/approve", async ({ params, member, briefService }: any) => {
    const grant = await briefService.approveDelivery(member.vid, params.id, params.bidId);
    return { statusCode: 200, data: grant, timestamp: new Date().toISOString() };
  })
  .post(
    "/briefs/:id/bids/:bidId/revise",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, briefService }: any) => {
      const bid = await briefService.reviseDelivery(
        member.vid,
        params.id,
        params.bidId,
        body?.note,
      );
      return { statusCode: 200, data: bid, timestamp: new Date().toISOString() };
    },
    { body: t.Optional(t.Object({ note: t.Optional(t.String()) })) },
  )
  .post(
    "/briefs/:id/bids/:bidId/reject",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, member, briefService }: any) => {
      await briefService.rejectDelivery(member.vid, params.id, params.bidId, body?.note);
      return { statusCode: 200, data: { rejected: true }, timestamp: new Date().toISOString() };
    },
    { body: t.Optional(t.Object({ note: t.Optional(t.String()) })) },
  );

export const licensingVendorRoutes = new Elysia()
  .use(licensingVendorReadRoutes)
  .use(licensingVendorWriteRoutes);
