import {
  CreateServiceAreaBody,
  CreateVendorLocationBody,
  UpdateVendorLocationBody,
} from "@materialhub/dto";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

// Vendor-facing location + service-area management. Gated by products.write as
// the outer vendor-member gate for Phase 2 (booking-specific perms + the
// location-scoped guard land in later tasks/phases).
export const locationRoutes = new Elysia({ prefix: "/vendor/booking" })
  .use(container)
  // jwtAuth populates `user` for vendorMembership below. It MUST be `.use()`d
  // in this same instance — Elysia's scoped derive does not cross plugin
  // encapsulation, so without it vendorMembership's `!user` branch 401s every
  // caller. Mirrors the coupon-routes / block-time.routes.ts precedent.
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      // biome-ignore lint/suspicious/noExplicitAny: Elysia guarded context is loosely typed
      .post(
        "/locations",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ body, member, locationController, set }: any) => {
          const data = await locationController.create(member.vid, body);
          set.status = 201;
          return ok(data, 201);
        },
        { body: CreateVendorLocationBody },
      )
      // biome-ignore lint/suspicious/noExplicitAny: guarded context
      .get("/locations", async ({ member, locationController }: any) =>
        ok(await locationController.list(member.vid)),
      )
      // biome-ignore lint/suspicious/noExplicitAny: guarded context
      .get("/locations/:id", async ({ params, member, locationController }: any) =>
        ok(await locationController.get(member.vid, params.id)),
      )
      .patch(
        "/locations/:id",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, body, member, locationController }: any) =>
          ok(await locationController.update(member.vid, params.id, body)),
        { body: UpdateVendorLocationBody },
      )
      .post(
        "/service-areas",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ body, member, locationController, set }: any) => {
          const data = await locationController.addServiceArea(member.vid, body);
          set.status = 201;
          return ok(data, 201);
        },
        { body: CreateServiceAreaBody },
      )
      // biome-ignore lint/suspicious/noExplicitAny: guarded context
      .get("/service-areas", async ({ member, locationController }: any) =>
        ok(await locationController.listServiceAreas(member.vid)),
      )
      .delete(
        "/service-areas/:id",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context
        async ({ params, member, locationController }: any) => {
          await locationController.removeServiceArea(member.vid, params.id);
          return ok({ id: params.id, removed: true });
        },
        { params: t.Object({ id: t.String() }) },
      ),
  );

// Public storefront read — active branches of a vendor.
export const locationPublicRoutes = new Elysia({ prefix: "/booking" }).use(container).get(
  "/vendors/:id/locations",
  // biome-ignore lint/suspicious/noExplicitAny: container context
  async ({ params, locationController, set }: any) => {
    set.headers["cache-control"] = "public, max-age=300";
    return ok(await locationController.listPublic(params.id));
  },
  { params: t.Object({ id: t.String() }) },
);
