import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown) => ({ statusCode: 200, data, timestamp: new Date().toISOString() });
const idParams = t.Object({ id: t.String({ format: "uuid" }) });

/**
 * Vendor side of the plastic-ban ready declaration (eco catalogue).
 * Certificates are uploaded first through `POST /media/presign` with
 * `asset_type: "eco_certificate"`; the returned key is sent here.
 */
export const ecoDeclarationRoutes = new Elysia({ prefix: "/products" })
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.read"))
      .get(
        "/:id/eco-declaration",
        async ({ params, member, ecoDeclarationService }: any) =>
          ok(await ecoDeclarationService.getForVendor(params.id, member.vid)),
        { params: idParams },
      )
      .get(
        "/:id/eco-declaration/certificate-url",
        async ({ params, member, ecoDeclarationService }: any) =>
          ok(await ecoDeclarationService.certificateUrlForVendor(params.id, member.vid)),
        { params: idParams },
      ),
  )
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .put(
        "/:id/eco-declaration",
        async ({ params, body, member, user, ecoDeclarationService }: any) =>
          ok(await ecoDeclarationService.declare(params.id, member.vid, user.id, body)),
        {
          params: idParams,
          body: t.Object({
            confirm: t.Boolean(),
            statement: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
            certificate_key: t.Optional(t.Nullable(t.String({ maxLength: 1024 }))),
            certificate_filename: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
          }),
        },
      )
      .delete(
        "/:id/eco-declaration",
        async ({ params, member, ecoDeclarationService }: any) =>
          ok(await ecoDeclarationService.withdraw(params.id, member.vid)),
        { params: idParams },
      ),
  );
