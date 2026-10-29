import {
  CreateStaffMemberBody,
  LinkStaffLocationBody,
  LinkStaffServiceBody,
  UpdateStaffMemberBody,
} from "@materialhub/dto";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

// biome-ignore lint/suspicious/noExplicitAny: Elysia guarded context is loosely typed
const actorOf = (ctx: any) => ({
  userId: ctx.user.id,
  vendorId: ctx.member.vid,
  role: ctx.member.r,
});

export const staffRoutes = new Elysia({ prefix: "/vendor/booking/staff" })
  .use(container)
  // jwtAuth populates `user` (read by actorOf) + drives vendorMembership below.
  // MUST be in this same instance — scoped derive doesn't cross plugin
  // encapsulation, so without it the guard's `!user` branch 401s every caller.
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      // Eligible-staff resolver (static path before /:id).
      // biome-ignore lint/suspicious/noExplicitAny: guarded context
      .get("/eligible", async ({ query, staffController }: any) =>
        ok(await staffController.listEligible(query.offering, query.location || undefined)),
      )
      .post(
        "/",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ body, member, staffController, set }: any) => {
          const data = await staffController.create(member.vid, body);
          set.status = 201;
          return ok(data, 201);
        },
        { body: CreateStaffMemberBody },
      )
      // biome-ignore lint/suspicious/noExplicitAny: guarded context
      .get("/", async ({ member, staffController }: any) =>
        ok(await staffController.list(member.vid)),
      )
      // biome-ignore lint/suspicious/noExplicitAny: guarded context
      .get("/:id", async ({ params, member, staffController }: any) =>
        ok(await staffController.get(member.vid, params.id)),
      )
      .patch(
        "/:id",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, body, member, staffController }: any) =>
          ok(await staffController.update(member.vid, params.id, body)),
        { body: UpdateStaffMemberBody },
      )
      // Fix-cycle-1 finding I-3 — the staff member's currently-linked
      // locations (persisted state), so the vendor-dashboard's
      // StaffLinksPanel can render real link status instead of
      // session-local tracking. Static-vs-dynamic ordering is irrelevant
      // here (GET is a distinct method from the POST/DELETE below on the
      // same path), so it's placed alongside its sibling verbs for the
      // location resource rather than needing a static-before-dynamic
      // guard like `/eligible` above.
      // biome-ignore lint/suspicious/noExplicitAny: guarded context
      .get("/:id/locations", async ({ params, member, staffController }: any) =>
        ok(await staffController.getLinkedLocations(member.vid, params.id)),
      )
      .post(
        "/:id/locations",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async (ctx: any) => {
          const data = await ctx.staffController.linkLocation(
            actorOf(ctx),
            ctx.params.id,
            ctx.body.vendor_location_id,
          );
          ctx.set.status = 201;
          return ok(data, 201);
        },
        { body: LinkStaffLocationBody },
      )
      .delete(
        "/:id/locations/:locationId",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async (ctx: any) =>
          ok(
            await ctx.staffController.unlinkLocation(
              actorOf(ctx),
              ctx.params.id,
              ctx.params.locationId,
            ),
          ),
        { params: t.Object({ id: t.String(), locationId: t.String() }) },
      )
      // Fix-cycle-1 finding I-3 — sibling read for the service-offering
      // links (mirrors the locations GET above).
      // biome-ignore lint/suspicious/noExplicitAny: guarded context
      .get("/:id/services", async ({ params, member, staffController }: any) =>
        ok(await staffController.getLinkedServices(member.vid, params.id)),
      )
      .post(
        "/:id/services",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, body, member, staffController, set }: any) => {
          const data = await staffController.linkService(
            member.vid,
            params.id,
            body.service_offering_id,
          );
          set.status = 201;
          return ok(data, 201);
        },
        { body: LinkStaffServiceBody },
      )
      .delete(
        "/:id/services/:offeringId",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, member, staffController }: any) =>
          ok(await staffController.unlinkService(member.vid, params.id, params.offeringId)),
        { params: t.Object({ id: t.String(), offeringId: t.String() }) },
      ),
  );

// Public storefront read (Task 0A, Phase 7 prerequisite) — an offering's
// eligible staff (PII-free), for the PDP availability picker. Mirrors
// location.routes.ts's split between the vendor-gated `staffRoutes` above
// and this public sibling; mounted root-level under `/booking` (same prefix
// `locationPublicRoutes` uses) so the gateway's verbatim `/booking` proxy
// reaches it with no path rewriting.
export const staffPublicRoutes = new Elysia({ prefix: "/booking" }).use(container).get(
  "/offerings/:id/staff",
  // biome-ignore lint/suspicious/noExplicitAny: container context is loosely typed
  async ({ params, query, offeringStaffController, set }: any) => {
    set.headers["cache-control"] = "public, max-age=300";
    return ok(await offeringStaffController.list(params.id, query.location || undefined));
  },
  {
    params: t.Object({ id: t.String({ format: "uuid" }) }),
    query: t.Object({ location: t.Optional(t.String()) }),
  },
);
