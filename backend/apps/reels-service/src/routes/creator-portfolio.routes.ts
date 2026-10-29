import { CreatorPortfolioFinalizeBody } from "@materialhub/dto";
import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

// biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
function mapPortfolioError(err: unknown, set: any) {
  if (err instanceof Error) {
    const map: Record<string, number> = {
      invalid_portfolio_key: 400,
      portfolio_sample_limit_reached: 409,
      video_not_found: 404,
      not_your_video: 404,
    };
    const code = map[err.message];
    if (code) {
      set.status = code;
      return { statusCode: code, error: err.message, timestamp: new Date().toISOString() };
    }
    // MediaService validation errors carry dynamic detail (content type, byte
    // count) in the message — same recognition-by-shape as
    // creator-application.routes.ts's mapApplyError.
    if (
      err.message.startsWith("Invalid content type") ||
      err.message.startsWith("File exceeds maximum size") ||
      err.message === "Invalid image format"
    ) {
      set.status = 400;
      return { statusCode: 400, error: err.message, timestamp: new Date().toISOString() };
    }
  }
  throw err;
}

export const creatorPortfolioRoutes = new Elysia({ prefix: "/me/creator/portfolio" })
  .use(container)
  .use(jwtAuth)
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
  .get("/videos", async ({ user, creatorPortfolioService }: any) => {
    const data = await creatorPortfolioService.listVideos(user.id);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })
  .post(
    "/videos/presign",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
    async ({ body, user, creatorPortfolioService, set }: any) => {
      try {
        const result = await creatorPortfolioService.presignVideo(
          user.id,
          body.filename,
          body.content_type,
        );
        return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapPortfolioError(err, set);
      }
    },
    {
      body: t.Object({
        filename: t.String({ minLength: 1 }),
        content_type: t.String({ minLength: 1 }),
      }),
    },
  )
  .post(
    "/videos",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
    async ({ body, user, creatorPortfolioService, set }: any) => {
      try {
        const video = await creatorPortfolioService.finalizeVideo(
          user.id,
          body.key,
          body.kind,
          body.caption,
        );
        set.status = 201;
        return { statusCode: 201, data: video, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapPortfolioError(err, set);
      }
    },
    { body: CreatorPortfolioFinalizeBody },
  )
  .delete(
    "/videos/:id",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
    async ({ params, user, creatorPortfolioService, set }: any) => {
      try {
        await creatorPortfolioService.deleteVideo(user.id, params.id);
        return { statusCode: 200, data: { deleted: true }, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapPortfolioError(err, set);
      }
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
