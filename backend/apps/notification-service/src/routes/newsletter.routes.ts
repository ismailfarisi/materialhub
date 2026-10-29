import { NewsletterSubscribeBody } from "@materialhub/dto";
import { jwtAuth } from "@materialhub/guards";
import { Elysia } from "elysia";
import { container } from "../container.ts";

function unsubscribePage(message: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MaterialHub</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;color:#3a2a23"><h1 style="font-weight:500">${message}</h1><p><a href="https://materialhubuae.com" style="color:#7a5c4a">Return to MaterialHub</a></p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const newsletterRoutes = new Elysia({ prefix: "/newsletter" })
  .use(container)

  .get("/health", () => ({
    status: "ok",
    service: "notification-service:newsletter",
    timestamp: new Date().toISOString(),
  }))

  // Public token-based unsubscribe — returns an HTML confirmation page.
  // Declared BEFORE `.use(jwtAuth)` so it never requires a token.
  .get("/unsubscribe", async ({ query, newsletterController }: any) => {
    const token = typeof query.token === "string" ? query.token : "";
    if (!token) return unsubscribePage("This unsubscribe link is not valid.");
    const ok = await newsletterController.unsubscribe(token);
    return ok
      ? unsubscribePage("You've been unsubscribed.")
      : unsubscribePage("This unsubscribe link is not valid.");
  })

  // jwtAuth runs in optional-auth mode for these paths (configured in
  // libs/guards/jwt-auth.ts) — `user` is populated when a valid token is
  // present, otherwise null. No 401 for guests.
  .use(jwtAuth)

  .post(
    "/subscribe",
    async ({ body, user, newsletterController }: any) => {
      const result = await newsletterController.subscribe(body, user?.id ?? null);
      // Upsert semantics → 200 (Elysia's default); the envelope statusCode conveys it.
      return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
    },
    { body: NewsletterSubscribeBody },
  )

  .get("/status", async ({ user, newsletterController }: any) => {
    const result = await newsletterController.status(user?.email ?? null);
    return { statusCode: 200, data: result, timestamp: new Date().toISOString() };
  });
