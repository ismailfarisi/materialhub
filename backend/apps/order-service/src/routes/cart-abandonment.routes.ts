import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia } from "elysia";
import { container } from "../container.ts";

export const cartAbandonmentRoutes = new Elysia({ prefix: "/admin/cart-abandonment" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))

  .get("/stats", async ({ cartAbandonmentController }: any) => {
    const data = await cartAbandonmentController.getStats();
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  });
