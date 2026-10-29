import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const shortlistRoutes = new Elysia({ prefix: "/vendor/reels/shortlist" })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("analytics.read"))
  .get("/", async ({ member, shortlistService, discoveryService }: any) => {
    const reelIds = await shortlistService.listReelIds(member.vid);
    const items = await discoveryService.cardsByIds(member.vid, reelIds);
    return {
      statusCode: 200,
      data: { items, asOf: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    };
  })
  .post(
    "/",
    async ({ body, member, user, shortlistService }: any) => {
      await shortlistService.save({
        vendorId: member.vid,
        reelId: body.reel_id,
        savedByUserId: user.id,
        note: body.note ?? null,
      });
      return { statusCode: 200, data: { saved: true }, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        reel_id: t.String(),
        note: t.Optional(t.String()),
      }),
    },
  )
  .delete("/:reelId", async ({ params, member, shortlistService }: any) => {
    await shortlistService.unsave(member.vid, params.reelId);
    return { statusCode: 200, data: { saved: false }, timestamp: new Date().toISOString() };
  });
