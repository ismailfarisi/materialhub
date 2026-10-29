// webhook.routes.ts
import { Elysia } from "elysia";
import { container } from "../container.ts";

export const webhookRoutes = new Elysia({ prefix: "/webhooks" })
  .use(container)
  .post("/stripe", async ({ request, checkoutController }: any) => {
    const body = await request.json();
    const eventId = body.id;
    const eventType = body.type;
    const payload = body.data?.object;

    const result = await checkoutController.handleStripeWebhook(eventId, eventType, payload);
    return { received: true, ...result };
  })
  .post("/tamara", async ({ request, checkoutController }: any) => {
    const body = await request.json();
    const tamaraToken = new URL(request.url).searchParams.get("tamaraToken");
    const authorization = request.headers.get("authorization");

    const result = await checkoutController.handleTamaraWebhook(tamaraToken, authorization, body);
    return { received: true, ...result };
  });
