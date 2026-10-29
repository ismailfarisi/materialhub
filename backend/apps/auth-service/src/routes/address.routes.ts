import { jwtAuth, requireRole } from "@materialhub/guards";
// address.routes.ts
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const verifiedPhoneRoutes = new Elysia({ prefix: "/auth/me/verified-phones" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("customer", "admin", "super_admin"))
  .post(
    "/start",
    async ({ user, body, addressPhoneVerificationService }: any) => {
      const result = await addressPhoneVerificationService.start(user.id, body.phone);
      return {
        statusCode: 200,
        message: "Verification code sent",
        data: result,
        timestamp: new Date().toISOString(),
      };
    },
    { body: t.Object({ phone: t.String({ minLength: 5, maxLength: 20 }) }) },
  )
  .post(
    "/confirm",
    async ({ user, body, addressPhoneVerificationService }: any) => {
      const result = await addressPhoneVerificationService.confirm(user.id, body.phone, body.code);
      return {
        statusCode: 200,
        message: "Phone verified",
        data: result,
        timestamp: new Date().toISOString(),
      };
    },
    {
      body: t.Object({
        phone: t.String({ minLength: 5, maxLength: 20 }),
        code: t.String({ minLength: 4, maxLength: 10 }),
      }),
    },
  )
  .get("/", async ({ user, addressPhoneVerificationService }: any) => {
    const data = await addressPhoneVerificationService.list(user.id);
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  });

export const addressRoutes = new Elysia({ prefix: "/auth/me/addresses" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("customer", "admin", "super_admin"))
  .get("/", async ({ user, addressService }: any) => {
    const addresses = await addressService.list(user.id);
    return { statusCode: 200, data: addresses, timestamp: new Date().toISOString() };
  })
  .get(
    "/:id",
    async ({ user, params, addressService }: any) => {
      const address = await addressService.getById(user.id, params.id);
      if (!address)
        return {
          statusCode: 404,
          message: "Address not found",
          timestamp: new Date().toISOString(),
        };
      return { statusCode: 200, data: address, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  )
  .post(
    "/",
    async ({ user, body, set, addressService }: any) => {
      const address = await addressService.create(user.id, body);
      set.status = 201;
      return { statusCode: 201, data: address, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        label: t.Optional(t.String({ default: "Home" })),
        type: t.Optional(t.String({ default: "shipping" })),
        first_name: t.Optional(t.String()),
        last_name: t.Optional(t.String()),
        full_name: t.Optional(t.String()),
        phone: t.String(),
        address_line_1: t.Optional(t.String()),
        street: t.Optional(t.String()),
        address_line_2: t.Optional(t.String()),
        area: t.Optional(t.String()),
        building_name: t.Optional(t.String()),
        apartment: t.Optional(t.String()),
        floor: t.Optional(t.String()),
        city: t.String(),
        state: t.Optional(t.String()),
        emirate: t.Optional(t.String()),
        postal_code: t.Optional(t.String()),
        country_code: t.Optional(t.String({ default: "AE" })),
        latitude: t.Optional(t.Number()),
        longitude: t.Optional(t.Number()),
        delivery_notes: t.Optional(t.String()),
        is_default: t.Optional(t.Boolean({ default: false })),
      }),
      transform({ body }: any) {
        // Map frontend fields to entity fields
        if (body.full_name && !body.first_name) {
          const parts = body.full_name.trim().split(/\s+/);
          body.first_name = parts[0] || "";
          body.last_name = parts.slice(1).join(" ") || "";
        }
        if (body.street && !body.address_line_1) {
          body.address_line_1 = body.street;
        }
        if (body.area && !body.address_line_2) {
          body.address_line_2 = body.area;
        }
        if (body.emirate && !body.state) {
          body.state = body.emirate;
        }
      },
    },
  )
  .patch(
    "/:id",
    async ({ user, params, body, addressService }: any) => {
      const address = await addressService.update(user.id, params.id, body);
      return { statusCode: 200, data: address, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        label: t.Optional(t.String()),
        type: t.Optional(t.String()),
        first_name: t.Optional(t.String()),
        last_name: t.Optional(t.String()),
        full_name: t.Optional(t.String()),
        phone: t.Optional(t.String()),
        address_line_1: t.Optional(t.String()),
        street: t.Optional(t.String()),
        address_line_2: t.Optional(t.String()),
        area: t.Optional(t.String()),
        building_name: t.Optional(t.String()),
        apartment: t.Optional(t.String()),
        floor: t.Optional(t.String()),
        city: t.Optional(t.String()),
        state: t.Optional(t.String()),
        emirate: t.Optional(t.String()),
        postal_code: t.Optional(t.String()),
        country_code: t.Optional(t.String()),
        latitude: t.Optional(t.Number()),
        longitude: t.Optional(t.Number()),
        delivery_notes: t.Optional(t.String()),
        is_default: t.Optional(t.Boolean()),
      }),
      transform({ body }: any) {
        if (body.full_name && !body.first_name) {
          const parts = body.full_name.trim().split(/\s+/);
          body.first_name = parts[0] || "";
          body.last_name = parts.slice(1).join(" ") || "";
        }
        if (body.street && !body.address_line_1) {
          body.address_line_1 = body.street;
        }
        if (body.area && !body.address_line_2) {
          body.address_line_2 = body.area;
        }
        if (body.emirate && !body.state) {
          body.state = body.emirate;
        }
      },
    },
  )
  .delete(
    "/:id",
    async ({ user, params, addressService }: any) => {
      await addressService.delete(user.id, params.id);
      return { statusCode: 200, message: "Address deleted", timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  );
