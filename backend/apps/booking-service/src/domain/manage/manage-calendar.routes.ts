// manage-calendar.routes.ts
//
// Task 0A (Phase 7 backend prerequisite) — GET /manage/calendar. Same guard
// chain as block-time.routes.ts / manual-booking.routes.ts:
// `vendorMembership("products.write")` at the route level (`.use(jwtAuth)`
// explicit here for the same mount-order-independence reason those two
// files' own comments give). Unlike block-time.routes.ts's GET /blocks, no
// `query:` schema is declared — from/to are REQUIRED but validated (with
// UnprocessableEntityError, not a schema 400) inside
// ManageCalendarService.list, mirroring AvailabilityController.getBySlug's
// own required-field validation style rather than block-time's schema-less
// BadRequestError check (see manage-calendar.service.ts's header comment for
// why the error class differs from block-time's).
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const manageCalendarRoutes = new Elysia({ prefix: "/manage" })
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app.use(vendorMembership("products.write")).get(
      "/calendar",
      // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
      async ({ query, user, member, manageCalendarController }: any) => {
        const actor = { userId: user.id, vendorId: member.vid, role: member.r };
        const data = await manageCalendarController.list(actor, query);
        return ok(data);
      },
    ),
  );
