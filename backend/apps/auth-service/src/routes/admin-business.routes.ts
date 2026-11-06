import { jwtAuth, requireRole } from "@materialhub/guards";
import { UnauthorizedError, auditPlugin } from "@materialhub/plugins";
// admin-business.routes.ts — platform review of business accounts and net terms.
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/** jwtAuth guarantees a user on these routes; this narrows the type. */
function uid(user: { id: string } | null | undefined): string {
  if (!user) throw new UnauthorizedError("Sign in to continue");
  return user.id;
}

const ok = (data: unknown) => ({ statusCode: 200, data, timestamp: new Date().toISOString() });
const idParam = { params: t.Object({ id: t.String({ format: "uuid" }) }) };

export const adminBusinessRoutes = new Elysia({ prefix: "/admin/business-accounts" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)
  .get(
    "/",
    async ({ query, businessAccountService }) => ok(await businessAccountService.adminList(query)),
    {
      query: t.Object({
        status: t.Optional(
          t.Union([t.Literal("pending"), t.Literal("verified"), t.Literal("rejected")]),
        ),
        net_terms: t.Optional(
          t.Union([
            t.Literal("applied"),
            t.Literal("approved"),
            t.Literal("rejected"),
            t.Literal("suspended"),
          ]),
        ),
        q: t.Optional(t.String({ maxLength: 100 })),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
    },
  )
  .get(
    "/:id",
    async ({ params, businessAccountService }) =>
      ok(await businessAccountService.adminGet(params.id)),
    idParam,
  )
  .get(
    "/:id/licence",
    async ({ params, audit, businessAccountService }) => {
      audit.skip = true;
      return ok(await businessAccountService.adminLicenceUrl(params.id));
    },
    idParam,
  )
  .post(
    "/:id/verification",
    async ({ user, params, body, audit, businessAccountService }) => {
      audit.entity_type = "business_account";
      audit.entity_id = params.id;
      audit.action = `business_account.${body.decision}`;
      return ok(await businessAccountService.adminVerify(uid(user), params.id, body));
    },
    {
      ...idParam,
      body: t.Object({
        decision: t.Union([t.Literal("verified"), t.Literal("rejected")]),
        reason: t.Optional(t.String({ maxLength: 1000 })),
      }),
    },
  )
  .post(
    "/:id/net-terms",
    async ({ user, params, body, audit, businessAccountService }) => {
      audit.entity_type = "business_credit_account";
      audit.entity_id = params.id;
      audit.action = `net_terms.${body.decision}`;
      return ok(await businessAccountService.adminDecideNetTerms(uid(user), params.id, body));
    },
    {
      ...idParam,
      body: t.Object({
        decision: t.Union([t.Literal("approved"), t.Literal("rejected"), t.Literal("suspended")]),
        terms: t.Optional(t.Union([t.Literal("net_30"), t.Literal("net_60")])),
        credit_limit_fils: t.Optional(t.Integer({ minimum: 1 })),
        note: t.Optional(t.String({ maxLength: 1000 })),
      }),
    },
  );
