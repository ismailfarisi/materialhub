import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const licensingCreatorRoutes = new Elysia({ prefix: "/me/creator/licensing" })
  .use(container)
  .use(jwtAuth)
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/offers", async ({ user, licensingService }: any) => {
    const offers = await licensingService.listIncoming(user.id);
    return { statusCode: 200, data: offers, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/offers/:id/accept", async ({ params, user, licensingService }: any) => {
    const grant = await licensingService.acceptOffer(user.id, params.id);
    return { statusCode: 200, data: grant, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/offers/:id/decline", async ({ params, user, licensingService }: any) => {
    await licensingService.declineOffer(user.id, params.id);
    return { statusCode: 200, data: { declined: true }, timestamp: new Date().toISOString() };
  })
  .post(
    "/offers/:id/counter",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, user, licensingService }: any) => {
      const offer = await licensingService.counterOffer(
        user.id,
        params.id,
        body.amount_fils,
        body.note ?? null,
      );
      return { statusCode: 200, data: offer, timestamp: new Date().toISOString() };
    },
    { body: t.Object({ amount_fils: t.Integer({ minimum: 1 }), note: t.Optional(t.String()) }) },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/offers/:id/events", async ({ params, user, licensingService }: any) => {
    const offer = await licensingService.getOffer(params.id);
    if (!offer || offer.creator_id !== user.id) {
      return { statusCode: 404, data: null, timestamp: new Date().toISOString() };
    }
    const events = await licensingService.listEvents(params.id);
    return { statusCode: 200, data: events, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/briefs", async ({ briefService }: any) => {
    const briefs = await briefService.listOpenBriefs();
    return { statusCode: 200, data: briefs, timestamp: new Date().toISOString() };
  })
  .post(
    "/briefs/:id/bids",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, user, briefService }: any) => {
      const bid = await briefService.placeBid(user.id, params.id, body.amount_fils, body.pitch);
      return { statusCode: 201, data: bid, timestamp: new Date().toISOString() };
    },
    { body: t.Object({ amount_fils: t.Integer(), pitch: t.String() }) },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/briefs/:id/bids/:bidId/withdraw", async ({ params, user, briefService }: any) => {
    await briefService.withdrawBid(user.id, params.id, params.bidId);
    return { statusCode: 200, data: { withdrawn: true }, timestamp: new Date().toISOString() };
  })
  .post(
    "/briefs/:id/bids/:bidId/deliver",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, user, briefService }: any) => {
      const bid = await briefService.submitDelivery(user.id, params.id, params.bidId, body.reel_id);
      return { statusCode: 200, data: bid, timestamp: new Date().toISOString() };
    },
    { body: t.Object({ reel_id: t.String() }) },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/bids", async ({ user, briefService }: any) => {
    const bids = await briefService.listBidsForCreator(user.id);
    return { statusCode: 200, data: bids, timestamp: new Date().toISOString() };
  });
