import { jwtAuth, requireRole } from "@materialhub/guards";
// checkout.routes.ts
import { Elysia, t } from "elysia";
import { In } from "typeorm";
import { container } from "../container.ts";

const quoteRlMap = new Map<string, { count: number; resetAt: number }>();
const QUOTE_RL_MAX = 10;
const QUOTE_RL_WINDOW_MS = 60_000;

function checkQuoteRl(userId: string): boolean {
  const now = Date.now();
  const entry = quoteRlMap.get(userId);
  if (!entry || entry.resetAt < now) {
    quoteRlMap.set(userId, { count: 1, resetAt: now + QUOTE_RL_WINDOW_MS });
    return true;
  }
  if (entry.count >= QUOTE_RL_MAX) return false;
  entry.count++;
  return true;
}

export const checkoutRoutes = new Elysia({ prefix: "/checkout" })
  .use(container)
  // ── Public routes (no auth) ─────────────────────────────────────────────
  // BNPL thresholds power the PDP "pay in installments" strip and are not
  // sensitive — they're the same min/max numbers Tabby/Tamara show publicly
  // on their own marketing pages. Mirrors the shipping.routes.ts precedent
  // of placing public reads above the `.use(jwtAuth)` line.
  .get(
    "/bnpl-thresholds",
    async ({ paymentMethodThresholdRepo }: any) => {
      const rows = await paymentMethodThresholdRepo.find({
        where: { is_active: true, provider: In(["tabby", "tamara"]) },
      });
      return {
        data: rows.map((r: any) => ({
          provider: r.provider,
          min_amount_fils: r.min_amount_fils,
          max_amount_fils: r.max_amount_fils,
          plans: r.plans,
          surcharge_fils: r.surcharge_fils ?? 0,
        })),
      };
    },
    {
      detail: {
        tags: ["Checkout"],
        summary: "List active BNPL provider thresholds for the PDP strip",
      },
      response: t.Object({
        data: t.Array(
          t.Object({
            provider: t.Union([t.Literal("tabby"), t.Literal("tamara")]),
            min_amount_fils: t.Number(),
            max_amount_fils: t.Number(),
            plans: t.Array(t.Object({ installments: t.Integer(), interval_days: t.Integer() })),
            surcharge_fils: t.Number(),
          }),
        ),
      }),
    },
  )
  // ── Authenticated routes ────────────────────────────────────────────────
  .use(jwtAuth)
  .use(requireRole("customer", "admin", "super_admin"))
  .get(
    "/quote",
    async ({ user, query, request, set, quoteController }: any) => {
      const userId: string = user.id;
      if (!checkQuoteRl(userId)) {
        set.status = 429;
        return {
          statusCode: 429,
          error: "RATE_LIMITED",
          message: "Too many quote requests",
          timestamp: new Date().toISOString(),
        };
      }
      const addressId: string | null = (query as any).address_id ?? null;
      const ifNoneMatch: string | null = request.headers.get("if-none-match");
      const result = await quoteController.getQuote(userId, addressId);
      if (ifNoneMatch && ifNoneMatch === result.etag) {
        set.status = 304;
        return;
      }
      set.headers.etag = result.etag;
      set.headers["cache-control"] = "private, max-age=60";
      return { statusCode: 200, data: result.response, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        address_id: t.Optional(t.String({ format: "uuid" })),
      }),
    },
  )
  .get("/payment-instruments", async ({ user, set, quoteController }: any) => {
    const result = await quoteController.getInstruments(user.id);
    set.headers["cache-control"] = "private, max-age=300";
    return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
  })
  .post(
    "/initiate",
    async ({ user, body, set, checkoutController }: any) => {
      const result = await checkoutController.initiateCheckout(user.id, {
        ...body,
        paymentMethod: body.payment_method,
      });
      if (result && (result as any).status === 409) {
        set.status = 409;
        return result;
      }
      return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        shippingAddress: t.Object(
          {
            first_name: t.Optional(t.Nullable(t.String())),
            last_name: t.Optional(t.Nullable(t.String())),
            full_name: t.Optional(t.Nullable(t.String())),
            phone: t.String(),
            address_line_1: t.Optional(t.Nullable(t.String())),
            street: t.Optional(t.Nullable(t.String())),
            address_line_2: t.Optional(t.Nullable(t.String())),
            area: t.Optional(t.Nullable(t.String())),
            building_name: t.Optional(t.Nullable(t.String())),
            apartment: t.Optional(t.Nullable(t.String())),
            floor: t.Optional(t.Nullable(t.String())),
            city: t.String(),
            state: t.Optional(t.Nullable(t.String())),
            emirate: t.Optional(t.Nullable(t.String())),
            postal_code: t.Optional(t.Nullable(t.String())),
            country_code: t.Optional(t.Nullable(t.String())),
          },
          { additionalProperties: true },
        ),
        billingAddress: t.Optional(t.Any()),
        shippingMethod: t.Optional(t.String()),
        customerNotes: t.Optional(t.String()),
        channel: t.Optional(t.String({ default: "web" })),
        quote_token: t.Optional(t.String()),
        address_id: t.Optional(t.String({ format: "uuid" })),
        payment_method: t.Optional(t.String()),
      }),
      transform({ body }: any) {
        const addr = body.shippingAddress;
        if (addr.full_name && !addr.first_name) {
          const parts = addr.full_name.trim().split(/\s+/);
          addr.first_name = parts[0] || "";
          addr.last_name = parts.slice(1).join(" ") || "";
        }
        if (addr.street && !addr.address_line_1) {
          addr.address_line_1 = addr.street;
        }
        if (addr.area && !addr.address_line_2) {
          addr.address_line_2 = addr.area;
        }
        if (!addr.first_name) addr.first_name = "";
        if (!addr.last_name) addr.last_name = "";
        if (!addr.address_line_1) addr.address_line_1 = addr.city;
      },
    },
  )
  .post(
    "/apply-coupon",
    async ({ user, body, checkoutController }: any) => {
      const result = await checkoutController.applyCoupon(user.id, body.order_id, body.coupon_code);
      return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        // Legacy field — the coupon is persisted on the cart, not an order.
        order_id: t.Optional(t.String({ format: "uuid" })),
        coupon_code: t.String(),
      }),
    },
  )
  .get("/available-coupons", async ({ user, checkoutController }: any) => {
    const coupons = await checkoutController.availableCoupons(user.id);
    return { statusCode: 200, data: coupons, timestamp: new Date().toISOString() };
  })
  .post(
    "/validate-coupon",
    async ({ user, body, checkoutController }: any) => {
      try {
        // Preview against the server-side cart — client-provided totals are
        // accepted for backward compat but never trusted.
        const result = await checkoutController.previewCoupon(user.id, body.coupon_code);
        return {
          statusCode: 200,
          data: { valid: true, discount_preview: result.discount, message: "Coupon applied" },
          timestamp: new Date().toISOString(),
        };
      } catch (err: any) {
        if (err.constructor?.name === "BadRequestError" || err.status === 400) {
          return {
            statusCode: 200,
            data: {
              valid: false,
              discount_preview: 0,
              error_code: "INVALID",
              message: err.message,
            },
            timestamp: new Date().toISOString(),
          };
        }
        throw err;
      }
    },
    {
      body: t.Object({
        coupon_code: t.String(),
        cart_subtotal: t.Optional(t.Integer()),
        cart_item_count: t.Optional(t.Integer()),
        cart_item_ids: t.Optional(t.Array(t.String())),
      }),
    },
  )
  .post(
    "/remove-coupon",
    async ({ user, checkoutController }: any) => {
      await checkoutController.removeCoupon(user.id);
      return { removed: true };
    },
    {
      body: t.Object({
        order_id: t.Optional(t.String({ format: "uuid" })),
      }),
    },
  )
  .post(
    "/payment-intent",
    async ({ user, body, checkoutController }: any) => {
      const result = await checkoutController.createPaymentIntent(
        body.order_id,
        user.id,
        body.amount,
        body.payment_method,
      );
      return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        order_id: t.String({ format: "uuid" }),
        amount: t.Integer(),
        payment_method: t.String(),
      }),
    },
  )
  .post(
    "/net-terms",
    // biome-ignore lint/suspicious/noExplicitAny: same untyped context as the sibling payment routes
    async ({ user, body, checkoutController }: any) => {
      // Pay on invoice (net 30/60) for approved business accounts. Idempotent.
      const result = await checkoutController.createPaymentIntent(
        body.order_id,
        user.id,
        undefined,
        "net_terms",
      );
      return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
    },
    { body: t.Object({ order_id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/cod",
    async ({ user, body, checkoutController }: any) => {
      const result = await checkoutController.createPaymentIntent(
        body.order_id,
        user.id,
        body.amount,
        "cash_on_delivery",
      );
      return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        order_id: t.String({ format: "uuid" }),
        amount: t.Integer(),
      }),
    },
  )
  .post(
    "/tabby",
    async ({ user, body, checkoutController }: any) => {
      const result = await checkoutController.createBnplSession(
        body.order_id,
        user.id,
        body.amount,
        "tabby",
        { returnUrl: body.return_url },
      );
      return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        order_id: t.String({ format: "uuid" }),
        amount: t.Integer(),
        return_url: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/tamara",
    async ({ user, body, checkoutController }: any) => {
      const result = await checkoutController.createBnplSession(
        body.order_id,
        user.id,
        body.amount,
        "tamara",
        {
          returnUrl: body.return_url,
          failureUrl: body.failure_url,
          cancelUrl: body.cancel_url,
        },
      );
      return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        order_id: t.String({ format: "uuid" }),
        // The order's grand_total is authoritative (see payment.service.ts:183,
        // `amount: (order as any).grand_total ?? data.amount`) — the client-supplied
        // amount is only a legacy fallback and is never trusted for a real order.
        amount: t.Optional(t.Integer()),
        return_url: t.Optional(t.String()),
        failure_url: t.Optional(t.String()),
        cancel_url: t.Optional(t.String()),
      }),
    },
  );
