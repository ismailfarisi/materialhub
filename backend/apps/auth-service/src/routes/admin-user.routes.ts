import { UserRole, UserStatus } from "@materialhub/database";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";

import { container } from "../container.ts";

const addressBody = {
  label: t.Optional(t.String()),
  type: t.Optional(t.Union([t.Literal("shipping"), t.Literal("billing"), t.Literal("both")])),
  first_name: t.Optional(t.String()),
  last_name: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  address_line_1: t.Optional(t.String()),
  address_line_2: t.Optional(t.Union([t.String(), t.Null()])),
  building_name: t.Optional(t.Union([t.String(), t.Null()])),
  apartment: t.Optional(t.Union([t.String(), t.Null()])),
  floor: t.Optional(t.Union([t.String(), t.Null()])),
  city: t.Optional(t.String()),
  state: t.Optional(t.Union([t.String(), t.Null()])),
  postal_code: t.Optional(t.Union([t.String(), t.Null()])),
  country_code: t.Optional(t.String({ minLength: 2, maxLength: 2 })),
  delivery_notes: t.Optional(t.Union([t.String(), t.Null()])),
  is_default: t.Optional(t.Boolean()),
};

export const adminUserRoutes = new Elysia({ prefix: "/admin/users" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  .get(
    "/",
    async ({ query, userAdminController }: any) => {
      const result = await userAdminController.list(query);
      return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
        role: t.Optional(t.Enum(UserRole)),
        status: t.Optional(t.Enum(UserStatus)),
        page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
      }),
    },
  )

  .get(
    "/:id",
    async ({ params, userAdminController }: any) => {
      const user = await userAdminController.getById(params.id);
      return { statusCode: 200, data: user, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  )

  .patch(
    "/:id/status",
    async ({ params, body, userAdminController, audit }) => {
      const result = await userAdminController.updateStatus(params.id, body.status);
      audit.action = "user.status_change";
      audit.entity_type = "user";
      audit.entity_id = params.id;
      if (result.previous_status !== result.status) {
        audit.changes = { status: { old: result.previous_status, new: result.status } };
      }
      return {
        statusCode: 200,
        data: { id: result.id, status: result.status },
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        status: t.Union([
          t.Literal("active"),
          t.Literal("suspended"),
          t.Literal("pending_verification"),
        ]),
      }),
    },
  )

  .patch(
    "/:id/role",
    async ({ params, body, userAdminController, audit }) => {
      const result = await userAdminController.updateRole(params.id, body.role);
      audit.action = "user.role_change";
      audit.entity_type = "user";
      audit.entity_id = params.id;
      if (result.previous_role !== result.role) {
        audit.changes = { role: { old: result.previous_role, new: result.role } };
      }
      return {
        statusCode: 200,
        data: { id: result.id, role: result.role },
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        role: t.Union([
          t.Literal("customer"),
          t.Literal("vendor"),
          t.Literal("admin"),
          t.Literal("super_admin"),
        ]),
      }),
    },
  )

  // Addresses are user-scoped in AddressService, so these admin handlers pass
  // the target user's id where the customer routes pass the caller's own.
  .get(
    "/:id/addresses",
    async ({ params, addressService, addressPhoneVerificationService }: any) => {
      const addresses = await addressService.list(params.id);
      const phones = addresses.map((a: any) => a.phone).filter(Boolean);
      // Resolved in one bulk lookup: the per-address isVerified() loop ran two
      // queries each and re-read the same users row every time.
      const verified: Map<string, boolean> = await addressPhoneVerificationService
        .isVerifiedBulk(params.id, phones)
        .catch(() => new Map<string, boolean>());
      const data = addresses.map((a: any) => ({
        ...a,
        phone_verified: a.phone ? (verified.get(a.phone) ?? false) : false,
      }));
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  )

  .patch(
    "/:id/addresses/:addressId",
    async ({ params, body, audit, addressService }: any) => {
      const before = await addressService.getById(params.id, params.addressId);
      const address = await addressService.update(params.id, params.addressId, body, {
        skipPhoneVerification: true,
      });

      audit.action = "user.address_update";
      audit.entity_type = "user_address";
      audit.entity_id = params.addressId;
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      for (const key of Object.keys(body)) {
        const old = (before as any)?.[key];
        const next = (address as any)?.[key];
        if (old !== next) changes[key] = { old, new: next };
      }
      if (Object.keys(changes).length > 0) audit.changes = changes;

      return { statusCode: 200, data: address, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        addressId: t.String({ format: "uuid" }),
      }),
      body: t.Object(addressBody),
    },
  )

  .delete(
    "/:id/addresses/:addressId",
    async ({ params, audit, addressService }: any) => {
      await addressService.delete(params.id, params.addressId);

      audit.action = "user.address_delete";
      audit.entity_type = "user_address";
      audit.entity_id = params.addressId;

      return {
        statusCode: 200,
        message: "Address deleted",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        addressId: t.String({ format: "uuid" }),
      }),
    },
  );
