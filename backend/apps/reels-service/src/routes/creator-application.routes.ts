import { CreatorApplicationApplyBody, CreatorProfileUpdateBody } from "@materialhub/dto";
import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

// biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
function mapApplyError(err: unknown, set: any) {
  if (err instanceof Error) {
    const map: Record<string, number> = {
      user_not_found: 404,
      already_creator: 409,
      application_open: 409,
      terms_not_accepted: 422,
      application_not_found: 404,
      invalid_avatar_key: 400,
    };
    const code = map[err.message];
    if (code) {
      set.status = code;
      return { statusCode: code, error: err.message, timestamp: new Date().toISOString() };
    }
    // MediaService validation errors carry dynamic detail (content type, byte
    // count) in the message, so they can't be an exact-match lookup like the
    // table above — recognized by prefix/shape instead.
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

export const creatorApplicationRoutes = new Elysia({ prefix: "/me/creator" })
  .use(container)
  .use(jwtAuth)
  .post(
    "/apply",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
    async ({ body, user, creatorApplicationService, set }: any) => {
      try {
        const app = await creatorApplicationService.apply(user.id, body);
        set.status = 201;
        return { statusCode: 201, data: app, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapApplyError(err, set);
      }
    },
    { body: CreatorApplicationApplyBody },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the creator-dashboard route pattern
  .get("/application", async ({ user, creatorApplicationService }: any) => {
    const app = await creatorApplicationService.getMine(user.id);
    return { statusCode: 200, data: app, timestamp: new Date().toISOString() };
  })
  .patch(
    "/application",
    async ({ body, user, creatorApplicationService, set }: any) => {
      try {
        const app = await creatorApplicationService.updateProfile(user.id, body);
        return { statusCode: 200, data: app, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapApplyError(err, set);
      }
    },
    { body: CreatorProfileUpdateBody },
  )
  .post(
    "/avatar/presign",
    async ({ body, user, creatorApplicationService, set }: any) => {
      try {
        const result = await creatorApplicationService.presignAvatar(
          user.id,
          body.filename,
          body.content_type,
        );
        return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapApplyError(err, set);
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
    "/avatar",
    async ({ body, user, creatorApplicationService, set }: any) => {
      try {
        const avatar_url = await creatorApplicationService.finalizeAvatar(user.id, body.key);
        return { statusCode: 200, data: { avatar_url }, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapApplyError(err, set);
      }
    },
    { body: t.Object({ key: t.String({ minLength: 1 }) }) },
  );
