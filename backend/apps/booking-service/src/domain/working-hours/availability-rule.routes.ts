import { TimeOffBody, WorkingHoursBody } from "@materialhub/dto";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

// Shares the /vendor/booking/staff prefix with staffRoutes, so the staff-id
// segment MUST use the same param name (:id) — Elysia forbids differing param
// names at the same path position. The sub-resource id uses a distinct name.
export const availabilityRuleRoutes = new Elysia({ prefix: "/vendor/booking/staff" })
  .use(container)
  // jwtAuth populates `user` for vendorMembership below — MUST be in this same
  // instance (scoped derive doesn't cross plugin encapsulation). Without it the
  // guard's `!user` branch 401s every caller. See coupon-routes precedent.
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .post(
        "/:id/working-hours",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, body, member, availabilityRuleController, set }: any) => {
          const data = await availabilityRuleController.addWorkingHours(
            member.vid,
            params.id,
            body,
          );
          set.status = 201;
          return ok(data, 201);
        },
        { body: WorkingHoursBody },
      )
      .get(
        "/:id/working-hours",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, member, availabilityRuleController }: any) =>
          ok(await availabilityRuleController.listWorkingHours(member.vid, params.id)),
      )
      .delete(
        "/:id/working-hours/:ruleId",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, member, availabilityRuleController }: any) =>
          ok(
            await availabilityRuleController.removeWorkingHours(
              member.vid,
              params.id,
              params.ruleId,
            ),
          ),
        { params: t.Object({ id: t.String(), ruleId: t.String() }) },
      )
      .post(
        "/:id/time-off",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, body, member, availabilityRuleController, set }: any) => {
          const data = await availabilityRuleController.addTimeOff(member.vid, params.id, body);
          set.status = 201;
          return ok(data, 201);
        },
        { body: TimeOffBody },
      )
      .get(
        "/:id/time-off",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, member, availabilityRuleController }: any) =>
          ok(await availabilityRuleController.listTimeOff(member.vid, params.id)),
      )
      .delete(
        "/:id/time-off/:offId",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, member, availabilityRuleController }: any) =>
          ok(await availabilityRuleController.removeTimeOff(member.vid, params.id, params.offId)),
        { params: t.Object({ id: t.String(), offId: t.String() }) },
      ),
  );
