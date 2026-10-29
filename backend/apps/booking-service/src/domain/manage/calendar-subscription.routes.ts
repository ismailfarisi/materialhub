// calendar-subscription.routes.ts
//
// Phase 6 Task 4 — PUT/GET/DELETE /manage/staff/:id/calendar-subscription.
// Same guard chain as Task 1/2's /manage routes: vendor-scoped via
// `vendorMembership("products.write")` at the route level; the location-scoped
// check runs inside CalendarSubscriptionService (staff->linked-locations
// derivation, since :id is a staff member, not a location).
import { UpsertCalendarSubscriptionBody } from "@materialhub/dto";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

const idParams = t.Object({ id: t.String({ format: "uuid" }) });

// `.use(jwtAuth)` explicit for the same mount-order-independence reason
// manual-booking.routes.ts / block-time.routes.ts give.
export const calendarSubscriptionRoutes = new Elysia({ prefix: "/manage" })
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .put(
        "/staff/:id/calendar-subscription",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, body, user, member, calendarSubscriptionController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await calendarSubscriptionController.upsert(actor, params.id, body);
          return ok(data);
        },
        { params: idParams, body: UpsertCalendarSubscriptionBody },
      )
      .get(
        "/staff/:id/calendar-subscription",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, user, member, calendarSubscriptionController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await calendarSubscriptionController.get(actor, params.id);
          return ok(data);
        },
        { params: idParams },
      )
      .delete(
        "/staff/:id/calendar-subscription",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, user, member, calendarSubscriptionController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          await calendarSubscriptionController.remove(actor, params.id);
          return ok({ deleted: true });
        },
        { params: idParams },
      ),
  );
