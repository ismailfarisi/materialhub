// manage-booking-actions.routes.ts
//
// Task 0B (Phase 7) — fills the "Phase 7 manage-surface gap" flagged in
// manage-booking.routes.ts: the vendor/location-manager MUTATIONS
// (complete / no-show / reschedule) plus location-membership CRUD. Same guard
// chain as block-time.routes.ts / manage-calendar.routes.ts:
// `vendorMembership("products.write")` at the route level (`.use(jwtAuth)`
// explicit for the same mount-order-independence reason those files give). All
// per-booking ownership + location scoping, and the owner/manager-only
// membership gating, live in the controllers/services — see
// manage-booking-actions.controller.ts / location-membership.service.ts.
//
// These are DISTINCT from the platform-admin `POST /bookings/:id/no-show`
// (manage-booking.routes.ts, `requireRole("admin","super_admin")`): different
// prefix (`/manage/bookings/*`), different gate (vendor JWT), different
// ownership model (vendor-scoped, not act-on-any).
import {
  CreateLocationMembershipBody,
  ManageRescheduleBookingBody,
  NoShowBookingBody,
} from "@materialhub/dto";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

export const manageBookingActionsRoutes = new Elysia({ prefix: "/manage" })
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      // ── Booking mutations ────────────────────────────────────────────────
      .post(
        "/bookings/:id/complete",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, user, member, manageBookingActionsController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await manageBookingActionsController.complete(actor, params.id);
          return ok(data);
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      )
      .post(
        "/bookings/:id/no-show",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, body, user, member, manageBookingActionsController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await manageBookingActionsController.noShow(actor, params.id, body);
          return ok(data);
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }), body: NoShowBookingBody },
      )
      .post(
        "/bookings/:id/reschedule",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, body, user, member, manageBookingActionsController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await manageBookingActionsController.reschedule(actor, params.id, body);
          return ok(data);
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: ManageRescheduleBookingBody,
        },
      )
      // ── Caller's own location memberships (self-scoped read, Task 7 fix
      // cycle Important #2) — lets the vendor-dashboard compute per-location
      // write gating for a location-admin/staff actor without them needing
      // the owner/manager-only /locations/:id/members route below (a
      // location-admin is 403'd from that one — see location-membership
      // .service.ts's assertOwnerManagerOfLocation).
      .get(
        "/my-location-memberships",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ user, member, locationMembershipController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await locationMembershipController.listMine(actor);
          return ok(data);
        },
      )
      // ── Location-membership CRUD (owner/manager only — enforced in service) ─
      .get(
        "/locations/:id/members",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, user, member, locationMembershipController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await locationMembershipController.list(actor, params.id);
          return ok(data);
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      )
      .post(
        "/locations/:id/members",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, body, user, member, locationMembershipController, set }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await locationMembershipController.create(actor, params.id, body);
          set.status = 201;
          return ok(data, 201);
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: CreateLocationMembershipBody,
        },
      )
      .delete(
        "/locations/:id/members/:membershipId",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, user, member, locationMembershipController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await locationMembershipController.delete(
            actor,
            params.id,
            params.membershipId,
          );
          return ok(data);
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            membershipId: t.String({ format: "uuid" }),
          }),
        },
      ),
  );
