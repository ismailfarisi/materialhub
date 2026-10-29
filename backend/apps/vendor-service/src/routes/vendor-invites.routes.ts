import { AppDataSource, User } from "@materialhub/database";
import { jwtAuth } from "@materialhub/guards";
import { HttpError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const vendorInvitesRoutes = new Elysia({ prefix: "/vendor-members" })
  .use(container)
  .onError({ as: "scoped" }, ({ error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.statusCode;
      const body: Record<string, unknown> = {
        statusCode: error.statusCode,
        error: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
      };
      const extra = (error as unknown as { extra?: Record<string, unknown> }).extra;
      if (extra) Object.assign(body, extra);
      return body;
    }
  })
  // Public: preview an invite (no auth)
  .get(
    "/invite/:token",
    async ({ params, vendorMemberService, set }) => {
      const preview = await vendorMemberService.previewInvite(params.token);
      if (!preview) {
        set.status = 404;
        return {
          statusCode: 404,
          error: "INVITE_NOT_FOUND",
          message: "Invite not found",
          timestamp: new Date().toISOString(),
        };
      }
      return { statusCode: 200, data: preview, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ token: t.String() }) },
  )
  // Public: decline an invite (token-only auth)
  .post(
    "/decline",
    async ({ body, vendorMemberService }) => {
      await vendorMemberService.declineInvite(body.token);
      return { statusCode: 200, message: "Invite declined", timestamp: new Date().toISOString() };
    },
    { body: t.Object({ token: t.String() }) },
  )
  // Authed: accept an invite
  .use(jwtAuth)
  .post(
    "/accept",
    async ({ body, user, vendorMemberService, set }) => {
      // Look up email_verified_at on the User entity (JWT may not carry this)
      const dbUser = await AppDataSource.getRepository(User).findOne({
        where: { id: user!.id },
      });
      const emailVerified = dbUser?.email_verified_at != null;

      try {
        await vendorMemberService.acceptInvite({
          token: body.token,
          authedUserId: user!.id,
          authedEmail: user!.email,
          emailVerified,
        });
      } catch (err) {
        // Special-case INVITE_EMAIL_MISMATCH: include both emails in the body
        if (err instanceof HttpError && err.code === "INVITE_EMAIL_MISMATCH") {
          const preview = await vendorMemberService.previewInvite(body.token);
          set.status = 409;
          return {
            statusCode: 409,
            error: "INVITE_EMAIL_MISMATCH",
            message: err.message,
            inviteEmail: preview?.invitedEmail,
            authedEmail: user!.email,
            timestamp: new Date().toISOString(),
          };
        }
        throw err;
      }
      return { statusCode: 200, message: "Invite accepted", timestamp: new Date().toISOString() };
    },
    { body: t.Object({ token: t.String() }) },
  );
