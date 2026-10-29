import { CreatorMediaKitBody } from "@materialhub/dto";
import { jwtAuth } from "@materialhub/guards";
import { Elysia } from "elysia";
import { creatorMediaKitService } from "../container.ts";

/**
 * The creator's own media-kit editor.
 *
 * Read-your-writes on a single row: GET returns null before the creator has
 * ever saved (the editor renders an empty form), PUT upserts.
 *
 * There is no publish step. Saving is what makes the kit visible on the vendor
 * directory's detail page — the service forces `is_published` true on every
 * upsert, and the field is not accepted from the body.
 *
 * Like creator-directory.routes.ts, the service is imported as a named
 * singleton rather than decorated onto the container: one more `.decorate`
 * tips admin-analytics.routes.ts into TS2589 (see container.ts).
 */
export const creatorMediaKitRoutes = new Elysia({ prefix: "/me/creator/media-kit" })
  .use(jwtAuth)
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
  .get("", async ({ user }: any) => {
    const data = await creatorMediaKitService.getMine(user.id);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })
  .put(
    "",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
    async ({ body, user }: any) => {
      const data = await creatorMediaKitService.upsert(user.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { body: CreatorMediaKitBody },
  );
