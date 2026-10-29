import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { creatorDirectoryService, creatorMediaKitService } from "../container.ts";

// The service is imported as a named singleton rather than destructured off a
// decorated context: the container cannot take another `.decorate` without
// pushing admin-analytics.routes.ts into TS2589 (see container.ts). Nothing
// else here needs the container, so this route does not `.use()` it at all.
//
// There is no vendor scoping either — vendorMembership gates who may call
// this, but every approved creator is visible to every vendor.
export const creatorDirectoryRoutes = new Elysia({ prefix: "/vendor/reels/creators" })
  .use(jwtAuth)
  .use(vendorMembership("analytics.read"))
  .get(
    "",
    async ({ query }) => {
      const data = await creatorDirectoryService.list({
        search: query.q ?? null,
        category: query.category ?? null,
        limit: query.limit,
        offset: query.offset,
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        category: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        offset: t.Optional(t.Numeric()),
      }),
    },
  )
  // One creator's media kit — the detail view behind a directory card.
  //
  // The response carries no contact route of any kind: no social handles (they
  // exist on creator_applications and are deliberately never read here), no
  // email, no phone. A vendor reaches a creator through a collab invite.
  .get(
    "/:id",
    async ({ params, set }) => {
      const data = await creatorMediaKitService.getForVendor(params.id);
      if (!data) {
        // 404 for "not an approved creator" as well as "no such user", so this
        // route cannot be used to probe which user ids exist.
        set.status = 404;
        return {
          statusCode: 404,
          error: "creator_not_found",
          timestamp: new Date().toISOString(),
        };
      }
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
