import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { HttpError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { assertVendorIdMatches } from "../services/vendor-member.validators.ts";

// NOTE: param is named `:id` to match `/vendors/:id/profile` in vendor.routes.ts.
// Elysia's router (memoirist) requires consistent parameter names at the same
// path position, so using `:vendorId` here would crash startup.
export const vendorMembersRoutes = new Elysia({ prefix: "/vendors/:id/members" })
  .use(container)
  .use(jwtAuth)
  .onError({ as: "scoped" }, ({ error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.statusCode;
      return {
        statusCode: error.statusCode,
        error: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })
  .guard({}, (app) =>
    app
      .use(vendorMembership("team.write"))
      .post(
        "/invite",
        async ({ params, body, member, user, vendorMemberService, set }: any) => {
          assertVendorIdMatches(params.id, member.vid);
          const result = await vendorMemberService.invite({
            vendorId: member.vid,
            email: body.email,
            role: body.role,
            invitedByUserId: user!.id,
          });
          set.status = 201;
          return { statusCode: 201, data: result, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            email: t.String({ format: "email" }),
            role: t.Union([t.Literal("manager"), t.Literal("staff"), t.Literal("viewer")]),
          }),
        },
      )
      .get(
        "/",
        async ({ params, member, vendorMemberService }: any) => {
          assertVendorIdMatches(params.id, member.vid);
          const data = await vendorMemberService.list({ vendorId: member.vid });
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String() }) },
      )
      .patch(
        "/:memberId",
        async ({ params, body, member, user, vendorMemberService }: any) => {
          assertVendorIdMatches(params.id, member.vid);
          await vendorMemberService.changeRole({
            vendorId: member.vid,
            memberId: params.memberId,
            newRole: body.role,
            actorUserId: user!.id,
          });
          return { statusCode: 200, message: "Role updated", timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String(), memberId: t.String() }),
          body: t.Object({
            role: t.Union([t.Literal("manager"), t.Literal("staff"), t.Literal("viewer")]),
          }),
        },
      )
      .delete(
        "/:memberId",
        async ({ params, member, user, vendorMemberService }: any) => {
          assertVendorIdMatches(params.id, member.vid);
          await vendorMemberService.remove({
            vendorId: member.vid,
            memberId: params.memberId,
            actorUserId: user!.id,
          });
          return {
            statusCode: 200,
            message: "Member removed",
            timestamp: new Date().toISOString(),
          };
        },
        { params: t.Object({ id: t.String(), memberId: t.String() }) },
      )
      .post(
        "/:memberId/resend",
        async ({ params, member, user, vendorMemberService }: any) => {
          assertVendorIdMatches(params.id, member.vid);
          const result = await vendorMemberService.resendInvite({
            vendorId: member.vid,
            memberId: params.memberId,
            actorUserId: user!.id,
          });
          return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String(), memberId: t.String() }) },
      )
      .post(
        "/transfer-ownership",
        async ({ params, body, member, user, vendorMemberService }: any) => {
          assertVendorIdMatches(params.id, member.vid);
          await vendorMemberService.transferOwnership({
            vendorId: member.vid,
            currentOwnerUserId: user!.id,
            targetMemberId: body.targetMemberId,
          });
          return {
            statusCode: 200,
            message: "Ownership transferred",
            timestamp: new Date().toISOString(),
          };
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({ targetMemberId: t.String() }),
        },
      ),
  );
