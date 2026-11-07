import { IntegrationDeliveryStatus, IntegrationDirection } from "@materialhub/database";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { isUuid } from "../domain/ids.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

const MAX_BULK = 1000;

export const replayRoutes = new Elysia({ prefix: "/admin/integrations" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .post(
    "/:id/replay-bulk",
    async ({ params, body, deliveryRepo, eventsQueue, set }: any) => {
      // No deliveries can match a malformed id; skip the query (22P02 on uuid).
      if (!isUuid(params.id)) return ok({ replayed: 0 });
      // Fetch ONE MORE than MAX_BULK to detect overflow without recounting.
      const qb = deliveryRepo
        .createQueryBuilder("d")
        .where("d.integration_id = :id", { id: params.id })
        .andWhere("d.direction = :dir", { dir: IntegrationDirection.outbound })
        .andWhere("d.status IN (:...statuses)", {
          statuses: [IntegrationDeliveryStatus.failed, IntegrationDeliveryStatus.dlq],
        });
      if (body.from) qb.andWhere("d.created_at >= :from", { from: body.from });
      if (body.to) qb.andWhere("d.created_at <= :to", { to: body.to });
      const rows = await qb.limit(MAX_BULK + 1).getMany();

      if (rows.length === 0) return ok({ replayed: 0 });
      if (rows.length > MAX_BULK) {
        set.status = 422;
        return {
          statusCode: 422,
          error: "TOO_MANY",
          message: `bulk replay capped at ${MAX_BULK}; tighten date range`,
        };
      }
      let count = 0;
      for (const row of rows) {
        await eventsQueue.add("emit", {
          event_type: row.event_type,
          vendor_id: (row.source_ref as any)?.vendor_id ?? "",
          payload: row.request_body, // unchanged for back-compat / log shape
          source_ref: row.source_ref,
          schema_version: 1,
          prebuiltBody: row.request_body, // instructs worker to skip mapping
        });
        count++;
      }
      return ok({ replayed: count });
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
      }),
    },
  );
