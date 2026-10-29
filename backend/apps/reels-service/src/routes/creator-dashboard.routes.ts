import type { ReelCommissionStatus } from "@materialhub/database";
import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/**
 * Creator dashboard HTTP endpoints. Not role-gated — any authenticated user
 * can have creator earnings. Thin glue over `CommissionService`; tested via
 * the service-layer unit tests and Task 14's end-to-end flow.
 */
export const creatorDashboardRoutes = new Elysia({ prefix: "/me/creator" })
  .use(container)
  .use(jwtAuth)
  .get("/summary", async ({ user, commissionService }: any) => {
    const rows = await commissionService.creatorSummary(user.id);
    const summary: Record<string, { count: number; totalFils: number }> = {};
    for (const r of rows) {
      // creatorSummary returns raw SQL aggregation rows; Postgres hands back
      // bigint as strings. Cast to Number at the boundary — don't use BigInt,
      // JSON serialization will fail and the dashboard expects a JS number.
      summary[r.status] = {
        count: Number(r.count),
        totalFils: Number(r.total_fils),
      };
    }
    return {
      statusCode: 200,
      data: summary,
      timestamp: new Date().toISOString(),
    };
  })
  .get(
    "/commissions",
    async ({ query, user, commissionService }: any) => {
      const status = query.status as ReelCommissionStatus | undefined;
      const cursor = query.cursor as string | undefined;
      const limit = query.limit ? Math.min(Number(query.limit), 100) : 20;
      const result = await commissionService.listForCreator(user.id, status, cursor, limit);
      // Envelope matches M1/M2 paginated-list convention (see feed.routes.ts
      // and social.routes.ts): spread `{ items, nextCursor }` at the top
      // level rather than nesting under `data`.
      return {
        statusCode: 200,
        ...result,
        timestamp: new Date().toISOString(),
      };
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .post("/payout", async ({ user, payoutService }: any) => {
    try {
      const result = await payoutService.requestPayout(user.id);
      return {
        statusCode: 200,
        data: {
          amountFils: result.amountFils,
          status: result.status,
          externalRef: result.externalRef,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      // Expected client-side error — surface as 422 with the machine-
      // readable message. Matches the M1/M2 envelope-return convention
      // used elsewhere in this route file.
      if (err instanceof Error && err.message.startsWith("payout_below_threshold")) {
        return {
          statusCode: 422,
          error: err.message,
          timestamp: new Date().toISOString(),
        };
      }
      throw err;
    }
  });
