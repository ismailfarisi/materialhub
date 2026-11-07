// webhook.routes.ts
import { Elysia } from "elysia";
import { container } from "../container.ts";

export const webhookRoutes = new Elysia({ prefix: "/webhooks" })
  .use(container)
  .post("/stripe", async ({ request, checkoutController }: any) => {
    // Raw body is required for Stripe signature verification — never parse
    // it as JSON first. Verification, the fail-closed 503 (no secret) and the
    // 400s (missing/invalid signature) live in WebhookService and surface as
    // HttpErrors through the module's errorHandler.
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");

    const result = await checkoutController.handleStripeWebhookRequest(rawBody, signature);
    return { received: true, ...result };
  })
  .post("/tamara", async ({ request, checkoutController }: any) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    const tamaraToken = new URL(request.url).searchParams.get("tamaraToken");
    const authorization = request.headers.get("authorization");

    // Token verification runs first inside handleTamaraWebhook, then payload
    // validation (400) — both before any webhook_events write.
    const result = await checkoutController.handleTamaraWebhook(tamaraToken, authorization, body);
    return { received: true, ...result };
  });
