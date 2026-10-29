import { CreateServiceOfferingBody, UpdateServiceOfferingBody } from "@materialhub/dto";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia } from "elysia";
import { container } from "../container.ts";

// Vendor-facing service catalog CRUD. Gated by products.write (services are a
// catalog capability); booking-specific RBAC lands in later phases.
export const serviceOfferingRoutes = new Elysia({ prefix: "/vendor/services" })
  .use(container)
  // jwtAuth populates `user` for vendorMembership below — MUST be in this same
  // instance (scoped derive doesn't cross plugin encapsulation). Without it the
  // guard's `!user` branch 401s every caller. Mirrors coupon-routes precedent.
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .post(
        "/",
        // biome-ignore lint/suspicious/noExplicitAny: Elysia derives the guarded context loosely
        async ({ body, member, serviceOfferingController, set }: any) => {
          const data = await serviceOfferingController.create(member.vid, body);
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        { body: CreateServiceOfferingBody },
      )
      // biome-ignore lint/suspicious/noExplicitAny: Elysia derives the guarded context loosely
      .get("/", async ({ member, serviceOfferingController }: any) => {
        const data = await serviceOfferingController.listForVendor(member.vid);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      })
      .patch(
        "/:id",
        // biome-ignore lint/suspicious/noExplicitAny: Elysia derives the guarded context loosely
        async ({ params, body, member, serviceOfferingController }: any) => {
          const data = await serviceOfferingController.update(member.vid, params.id, body);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { body: UpdateServiceOfferingBody },
      ),
  );
