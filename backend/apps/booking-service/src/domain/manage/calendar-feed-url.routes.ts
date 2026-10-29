// calendar-feed-url.routes.ts
//
// Phase 6 Task 5 — POST /manage/staff/:id/calendar-feed-url. Same guard chain
// as Task 1/2/4's /manage routes: vendor-scoped via
// `vendorMembership("products.write")` at the route level; the
// location-scoped check runs inside CalendarFeedUrlService (staff -> linked
// -locations derivation, same as calendar-subscription.routes.ts's PUT/GET/
// DELETE).
//
// POST (not GET) — deliberate choice between the brief's two options.
// Task 4's CRUD style reserves GET for reading back STORED state (the
// subscription row). There's no stored state here to read: the token is a
// pure, deterministic HMAC re-derived on every call (see
// calendar-feed-url.service.ts's header), so semantically this is an ACTION
// ("(re)issue the link for me to copy"), which this repo's other
// action-shaped `/manage` endpoints (e.g. manual-booking.routes.ts's POST
// /manage/bookings) express as POST. Calling it twice is safe (same URL both
// times) but it's not a resource read, so GET would be a stretch.
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
// calendar-subscription.routes.ts / manual-booking.routes.ts give.
export const calendarFeedUrlRoutes = new Elysia({ prefix: "/manage" })
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app.use(vendorMembership("products.write")).post(
      "/staff/:id/calendar-feed-url",
      // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
      async ({ params, user, member, calendarFeedUrlController }: any) => {
        const actor = { userId: user.id, vendorId: member.vid, role: member.r };
        const data = await calendarFeedUrlController.issue(actor, params.id);
        return ok(data);
      },
      { params: idParams },
    ),
  );
