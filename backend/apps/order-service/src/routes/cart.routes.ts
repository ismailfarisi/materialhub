import { AppDataSource, GuestSession } from "@materialhub/database";
import { jwtAuth } from "@materialhub/guards";
// cart.routes.ts
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const guestSessionRepo = AppDataSource.getRepository(GuestSession);

export const cartRoutes = new Elysia({ prefix: "/cart" })
  .use(container)
  .get("/health", () => ({
    status: "ok",
    service: "order-service-cart",
    timestamp: new Date().toISOString(),
  }))
  .use(jwtAuth)
  // Helper to resolve guest session token to guest_sessions.id
  .derive(async ({ request, user }) => {
    const sessionToken = request.headers.get("x-guest-session") || null;
    let guestSessionId: string | null = null;
    if (sessionToken && !(user as any)?.id) {
      // Auth service stores SHA-256 hash of the session token
      const tokenHash = new Bun.CryptoHasher("sha256").update(sessionToken).digest("hex");
      const session = await guestSessionRepo.findOne({
        where: { session_token: tokenHash },
      });
      if (session) guestSessionId = session.id;
    }
    return { userId: (user as any)?.id || null, guestSessionId };
  })
  .get("/", async ({ userId, guestSessionId, cartController }: any) => {
    const result = await cartController.getCart(userId, guestSessionId);
    return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
  })
  .post(
    "/items",
    async ({ userId, guestSessionId, body, cartController, set }: any) => {
      const item = await cartController.addItem(userId, guestSessionId, body);
      set.status = 201;
      return { statusCode: 201, data: item, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        productId: t.String({ format: "uuid" }),
        variantId: t.Nullable(t.String({ format: "uuid" })),
        quantity: t.Integer({ minimum: 1 }),
      }),
    },
  )
  .patch(
    "/items/:variantId",
    async ({ userId, guestSessionId, params, body, cartController }: any) => {
      await cartController.updateQuantity(userId, guestSessionId, params.variantId, body.quantity);
      return { statusCode: 200, message: "Updated", timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ variantId: t.String() }),
      body: t.Object({ quantity: t.Integer({ minimum: 0 }) }),
    },
  )
  .delete("/", async ({ userId, guestSessionId, cartController }: any) => {
    await cartController.clear(userId, guestSessionId);
    return { statusCode: 200, message: "Cart cleared", timestamp: new Date().toISOString() };
  })
  .post(
    "/gift-box",
    async ({ userId, guestSessionId, body, cartController, set }: any) => {
      const data = await cartController.addGiftBox(userId, guestSessionId, body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        giftBoxId: t.String({ format: "uuid" }),
        quantity: t.Optional(t.Integer({ minimum: 1 })),
        giftMessage: t.Optional(t.Union([t.String(), t.Null()])),
        recipientName: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .delete(
    "/gift-box/:id",
    async ({ userId, guestSessionId, params, cartController }: any) => {
      await cartController.removeGiftBox(userId, guestSessionId, params.id);
      return { statusCode: 200, message: "Removed", timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/affiliate",
    async ({ userId, guestSessionId, body, cartController }: any) => {
      await cartController.setAffiliateCode(userId, guestSessionId, body.code ?? null);
      return { statusCode: 200, data: { ok: true }, timestamp: new Date().toISOString() };
    },
    { body: t.Object({ code: t.String({ maxLength: 50 }) }) },
  )
  // Merge a guest cart into the logged-in user's cart.
  // Requires authentication (NOT in OPTIONAL_AUTH_ROUTES) and the guest's
  // session token in the `x-guest-session` header.
  .post("/merge", async ({ userId, request, cartController, set }: any) => {
    if (!userId) {
      set.status = 401;
      return {
        statusCode: 401,
        message: "Authentication required to merge guest cart",
        error: "UNAUTHORIZED",
        timestamp: new Date().toISOString(),
      };
    }

    const sessionToken = request.headers.get("x-guest-session");
    if (!sessionToken) {
      set.status = 400;
      return {
        statusCode: 400,
        message: "Missing x-guest-session header",
        error: "BAD_REQUEST",
        timestamp: new Date().toISOString(),
      };
    }

    const tokenHash = new Bun.CryptoHasher("sha256").update(sessionToken).digest("hex");
    const session = await guestSessionRepo.findOne({ where: { session_token: tokenHash } });
    if (!session) {
      // Idempotent: nothing to merge. Treat as no-op success so the frontend
      // can safely clear its stored guest session token after login.
      return {
        statusCode: 200,
        message: "No guest cart to merge",
        timestamp: new Date().toISOString(),
      };
    }

    await cartController.mergeGuestCart(session.id, userId);
    return {
      statusCode: 200,
      message: "Guest cart merged",
      timestamp: new Date().toISOString(),
    };
  });
