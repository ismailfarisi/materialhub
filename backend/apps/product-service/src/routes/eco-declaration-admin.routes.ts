import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const ok = (data: unknown) => ({ statusCode: 200, data, timestamp: new Date().toISOString() });
const idParams = t.Object({ id: t.String({ format: "uuid" }) });

/** Admin review queue for plastic-ban ready declarations (eco catalogue). */
export const ecoDeclarationAdminRoutes = new Elysia({ prefix: "/admin/eco-declarations" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)
  .get("/", async ({ query, ecoDeclarationService }: any) =>
    ok(await ecoDeclarationService.adminList(query)),
  )
  .get(
    "/:id",
    async ({ params, ecoDeclarationService }: any) =>
      ok(await ecoDeclarationService.adminGet(params.id)),
    { params: idParams },
  )
  .get(
    "/:id/certificate-url",
    async ({ params, ecoDeclarationService }: any) =>
      ok(await ecoDeclarationService.adminCertificateUrl(params.id)),
    { params: idParams },
  )
  .patch(
    "/:id/approve",
    async ({ params, user, ecoDeclarationService }: any) =>
      ok(await ecoDeclarationService.approve(params.id, user.id)),
    { params: idParams },
  )
  .patch(
    "/:id/reject",
    async ({ params, body, user, ecoDeclarationService }: any) =>
      ok(await ecoDeclarationService.reject(params.id, user.id, body.reason)),
    {
      params: idParams,
      body: t.Object({ reason: t.String({ minLength: 5, maxLength: 2000 }) }),
    },
  );
