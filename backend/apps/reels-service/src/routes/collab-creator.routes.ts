import { CollabActor } from "@materialhub/database";
import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown) => ({
  statusCode: 200,
  data,
  timestamp: new Date().toISOString(),
});

/** Creator-side collab surface: own invites and applications. */
export const collabCreatorRoutes = new Elysia({ prefix: "/me/creator/collabs" })
  .use(container)
  .use(jwtAuth)
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .get("/", async ({ user, collabService }: any) =>
    ok(await collabService.listApplicationsForCreator(user.id)),
  )
  .post(
    "/:id/apply",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, user, collabService }: any) => {
      const app = await collabService.apply(user.id, params.id, {
        pitch: body?.pitch ?? null,
        proposedFeeFils: body?.proposedFeeFils ?? null,
      });
      return { statusCode: 201, data: app, timestamp: new Date().toISOString() };
    },
    {
      body: t.Optional(
        t.Object({
          pitch: t.Optional(t.Union([t.String(), t.Null()])),
          proposedFeeFils: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
        }),
      ),
    },
  )
  .post(
    "/applications/:appId/accept",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, user, collabService }: any) =>
      ok(await collabService.respondToInvite(user.id, params.appId, true)),
  )
  .post(
    "/applications/:appId/decline",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, user, collabService }: any) =>
      ok(await collabService.respondToInvite(user.id, params.appId, false)),
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/applications/:appId/withdraw", async ({ params, user, collabService }: any) => {
    await collabService.withdraw(user.id, params.appId);
    return ok({ withdrawn: true });
  })
  .post(
    "/applications/:appId/address",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, user, collabService }: any) =>
      ok(await collabService.setShippingAddress(user.id, params.appId, body.addressId)),
    { body: t.Object({ addressId: t.String({ format: "uuid" }) }) },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  .post("/applications/:appId/confirm-receipt", async ({ params, user, collabService }: any) =>
    ok(
      await collabService.confirmReceipt(params.appId, {
        kind: CollabActor.creator,
        creatorId: user.id,
      }),
    ),
  )
  .post(
    "/applications/:appId/deliver",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
    async ({ params, body, user, collabService }: any) =>
      ok(await collabService.submitDelivery(user.id, params.appId, body?.reelId ?? null)),
    {
      // Optional: an event_appearance produces no reel, so the vendor confirms
      // attendance instead. The service enforces that reel-producing types
      // still require one.
      body: t.Optional(
        t.Object({ reelId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])) }),
      ),
    },
  );
