import { Elysia } from "elysia";
import { container } from "../container.ts";

export const vendorWebhookRoutes = new Elysia({ prefix: "/webhooks" })
  .use(container)
  .post("/stripe/connect", async ({ request, vendorController, set }) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      set.status = 400;
      return {
        statusCode: 400,
        message: "Missing stripe-signature header",
        timestamp: new Date().toISOString(),
      };
    }

    // Read raw body for Stripe signature verification
    const rawBody = await request.text();

    try {
      await vendorController.handleStripeWebhook(rawBody, signature);
      return { statusCode: 200, received: true };
    } catch (_err: any) {
      set.status = 400;
      return {
        statusCode: 400,
        message: "Webhook verification failed",
        timestamp: new Date().toISOString(),
      };
    }
  });
