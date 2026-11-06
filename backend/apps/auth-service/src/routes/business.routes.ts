import { jwtAuth, requireRole } from "@materialhub/guards";
// business.routes.ts — the buyer's own business account (storefront).
import { UnauthorizedError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/** jwtAuth guarantees a user on these routes; this narrows the type. */
function uid(user: { id: string } | null | undefined): string {
  if (!user) throw new UnauthorizedError("Sign in to continue");
  return user.id;
}

const ok = (data: unknown) => ({ statusCode: 200, data, timestamp: new Date().toISOString() });

const billingAddress = t.Object({
  line1: t.String({ maxLength: 255 }),
  line2: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  city: t.String({ maxLength: 100 }),
  emirate: t.String({ maxLength: 100 }),
  po_box: t.Optional(t.Nullable(t.String({ maxLength: 20 }))),
  country_code: t.Optional(t.String({ minLength: 2, maxLength: 2 })),
});

const businessFields = {
  legal_name: t.String({ maxLength: 255 }),
  trade_name: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  trade_licence_number: t.String({ maxLength: 100 }),
  trade_licence_issuer: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  trade_licence_expiry: t.String({ maxLength: 10 }),
  trade_licence_document_key: t.Optional(t.Nullable(t.String({ maxLength: 1024 }))),
  vat_registered: t.Boolean(),
  trn: t.Optional(t.Nullable(t.String({ maxLength: 32 }))),
  billing_address: billingAddress,
};

const role = t.Union([t.Literal("admin"), t.Literal("approver"), t.Literal("buyer")]);

export const businessRoutes = new Elysia({ prefix: "/auth/me/business" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("customer", "admin", "super_admin"))
  .get("/", async ({ user, businessAccountService }) =>
    ok(await businessAccountService.getMine(uid(user))),
  )
  .post(
    "/",
    async ({ user, body, set, businessAccountService }) => {
      set.status = 201;
      return { ...ok(await businessAccountService.create(uid(user), body)), statusCode: 201 };
    },
    { body: t.Object(businessFields) },
  )
  .patch(
    "/",
    async ({ user, body, businessAccountService }) =>
      ok(await businessAccountService.update(uid(user), body)),
    {
      body: t.Partial(
        t.Object({
          ...businessFields,
          approval_threshold_fils: t.Nullable(t.Integer({ minimum: 0 })),
        }),
      ),
    },
  )
  .get("/members", async ({ user, businessAccountService }) =>
    ok(await businessAccountService.listMembers(uid(user))),
  )
  .post(
    "/members",
    async ({ user, body, businessAccountService }) =>
      ok(await businessAccountService.invite(uid(user), body)),
    { body: t.Object({ email: t.String({ maxLength: 255 }), role }) },
  )
  .patch(
    "/members/:id",
    async ({ user, params, body, businessAccountService }) =>
      ok(await businessAccountService.changeRole(uid(user), params.id, body.role)),
    { params: t.Object({ id: t.String({ format: "uuid" }) }), body: t.Object({ role }) },
  )
  .delete(
    "/members/:id",
    async ({ user, params, businessAccountService }) =>
      ok(await businessAccountService.removeMember(uid(user), params.id)),
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/invites/:id/accept",
    async ({ user, params, businessAccountService }) =>
      ok(await businessAccountService.acceptInvite(uid(user), params.id)),
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/invites/:id/decline",
    async ({ user, params, businessAccountService }) =>
      ok(await businessAccountService.declineInvite(uid(user), params.id)),
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/net-terms",
    async ({ user, body, businessAccountService }) =>
      ok(await businessAccountService.applyNetTerms(uid(user), body)),
    {
      body: t.Object({
        terms: t.Union([t.Literal("net_30"), t.Literal("net_60")]),
        requested_limit_fils: t.Integer({ minimum: 1 }),
        note: t.Optional(t.Nullable(t.String({ maxLength: 1000 }))),
      }),
    },
  );
