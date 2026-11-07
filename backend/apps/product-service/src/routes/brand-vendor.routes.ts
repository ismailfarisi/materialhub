import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/**
 * Brand routes for a signed-in vendor.
 *
 * A vendor cannot create catalogue data, but they hit a wall when the brand
 * they sell isn't in the list. These two routes are that escape hatch: submit
 * the missing brand, then keep using it while an admin reviews it. The brand
 * row exists from submission, so products can reference it immediately; it just
 * stays out of every public reader until approved.
 *
 * Approved brands belong to the catalogue, not to the vendor who asked for
 * them — there is deliberately no edit or delete route here.
 *
 * Permissions reuse the product ones: asking for a brand is part of listing a
 * product, so anyone who can write products can submit, and anyone who can read
 * them can see the picker.
 */
export const brandVendorRoutes = new Elysia({ prefix: "/vendor/brands" })
  .use(container)
  // vendorMembership reads the `user` jwtAuth derives; without it every call
  // was "Authentication required", even for the vendor owner.
  .use(jwtAuth)

  .guard({}, (app) =>
    app.use(vendorMembership("products.read")).get(
      "/",
      // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the vendor route pattern
      async ({ query, member, brandController }: any) => {
        const data = await brandController.listForVendor(member.vid, {
          q: query.q,
          limit: query.limit ? Number(query.limit) : undefined,
        });
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      },
      {
        query: t.Object({
          q: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
      },
    ),
  )

  .guard({}, (app) =>
    app.use(vendorMembership("products.write")).post(
      "/",
      // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the vendor route pattern
      async ({ body, member, brandController, set }: any) => {
        const data = await brandController.submitForVendor(member.vid, body);
        set.status = 201;
        return { statusCode: 201, data, timestamp: new Date().toISOString() };
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 200 }),
          logo_url: t.Optional(t.String({ maxLength: 1024 })),
          description: t.Optional(t.String({ maxLength: 2000 })),
          website_url: t.Optional(t.String({ maxLength: 512 })),
        }),
      },
    ),
  );
