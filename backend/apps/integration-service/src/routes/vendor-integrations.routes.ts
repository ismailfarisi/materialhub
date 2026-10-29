import {
  IntegrationDeliveryStatus,
  IntegrationDirection,
  type IntegrationEventType,
} from "@materialhub/database";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { DispatcherService } from "../domain/dispatcher/dispatcher.service.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

// Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
// permission-aware `vendorMembership(...)` guards. Read routes use
// `products.read`; mutations use `products.write`; deliveries listing uses
// `analytics.read` (delivery logs are observability surface).
export const vendorIntegrationsRoutes = new Elysia({ prefix: "/vendor/integrations" })
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.read"))
      .get("/", async ({ member, integrationController }: any) => {
        return ok(await integrationController.list(member.vid));
      })
      .get(
        "/:id",
        async ({ params, member, integrationController }: any) => {
          return ok(await integrationController.get(params.id, member.vid));
        },
        { params: t.Object({ id: t.String() }) },
      ),
  )
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .post(
        "/",
        async ({ body, member, integrationController, set }: any) => {
          const result = await integrationController.create(member.vid, body);
          set.status = 201;
          return ok(
            {
              ...result.integration,
              inbound_secret_plaintext: result.inbound_secret_plaintext,
              outbound_secret_plaintext: result.outbound_secret_plaintext,
              inbound_url: `/integrations/inbound/${result.integration.id}`,
            },
            201,
          );
        },
        {
          body: t.Object({
            name: t.String({ minLength: 1, maxLength: 255 }),
            outbound_url: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        },
      )
      .patch(
        "/:id",
        async ({ params, body, member, integrationController }: any) => {
          return ok(await integrationController.update(params.id, member.vid, body));
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            name: t.Optional(t.String()),
            outbound_url: t.Optional(t.Union([t.String(), t.Null()])),
            inbound_ip_allowlist: t.Optional(t.Array(t.String())),
            inventory_authority: t.Optional(
              t.Union([t.Literal("authoritative"), t.Literal("advisory")]),
            ),
            pricing_authority: t.Optional(
              t.Union([t.Literal("authoritative"), t.Literal("advisory")]),
            ),
            is_active: t.Optional(t.Boolean()),
          }),
        },
      )
      .delete(
        "/:id",
        async ({ params, member, integrationController }: any) => {
          return ok(await integrationController.delete(params.id, member.vid));
        },
        { params: t.Object({ id: t.String() }) },
      )
      .post(
        "/:id/rotate-secret",
        async ({ params, body, member, integrationController }: any) => {
          const r = await integrationController.rotateSecret(params.id, member.vid, body.direction);
          return ok({ plaintext: r.plaintext });
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            direction: t.Union([t.Literal("outbound"), t.Literal("inbound")]),
          }),
        },
      )
      .post(
        "/:id/test-fire",
        async ({
          params,
          body,
          member,
          integrationController,
          mappingService,
          deliveryRepo,
          encryption,
          set,
        }: any) => {
          // 1. Verify ownership
          const integration = await integrationController.get(params.id, member.vid);

          // 2. Find enabled outbound mapping for this event_type
          const allMappings = await mappingService.list(integration.id);
          const mapping = allMappings.find(
            (m: any) =>
              m.event_type === body.event_type && m.direction === IntegrationDirection.outbound,
          );

          if (!mapping || mapping.is_enabled === false) {
            set.status = 422;
            return {
              error: "NO_OUTBOUND_MAPPING",
              message: "Configure an enabled outbound mapping for this event_type before testing.",
            };
          }

          // 3. Build source context
          let sourceContext: Record<string, unknown>;
          if (body.sample_payload && typeof body.sample_payload === "object") {
            sourceContext = body.sample_payload as Record<string, unknown>;
          } else {
            sourceContext = {
              vendor_order: {
                vendor_order_number: "VO-TEST",
                status: "shipped",
                vendor_total: 12345,
              },
              order: {
                user: { email: "test@example.com", first_name: "Test", last_name: "User" },
              },
              shipment: {
                tracking_number: "TRK-TEST",
                delivered_at: new Date().toISOString(),
              },
            };
          }

          // 4. Decrypt outbound secret
          const outbound_secret = integration.outbound_secret_encrypted
            ? encryption.decrypt(integration.outbound_secret_encrypted)
            : null;

          // 5. Dispatch
          const dispatcherService = new DispatcherService();
          const result = await dispatcherService.dispatchOutbound({
            integration: {
              id: integration.id,
              vendor_id: integration.vendor_id,
              outbound_url: integration.outbound_url,
              outbound_secret,
            },
            mapping: { spec: mapping.spec },
            eventType: body.event_type as IntegrationEventType,
            sourceContext,
            sourceRef: { test_fire: true },
          });

          // 6. Persist delivery row
          const status =
            result.status === "delivered"
              ? IntegrationDeliveryStatus.delivered
              : result.status === "skipped"
                ? IntegrationDeliveryStatus.skipped
                : IntegrationDeliveryStatus.failed;

          const saved = await deliveryRepo.save({
            integration_id: integration.id,
            event_type: body.event_type,
            direction: IntegrationDirection.outbound,
            source_ref: { test_fire: true },
            idempotency_key: result.idempotencyKey || null,
            request_body: result.requestBody,
            response_status: result.responseStatus,
            response_body: result.responseBody,
            latency_ms: result.latencyMs,
            attempt: 1,
            status,
            error_message: result.errorMessage,
          });

          return ok({ delivery_id: saved.id });
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            event_type: t.String(),
            sample_payload: t.Optional(t.Object({}, { additionalProperties: true })),
          }),
        },
      ),
  )
  .guard({}, (app) =>
    app.use(vendorMembership("analytics.read")).get(
      "/:id/deliveries",
      async ({ params, query, member, integrationController, deliveryRepo }: any) => {
        // Verify ownership (throws 404 if not owned)
        await integrationController.get(params.id, member.vid);

        const limit = Math.min(Math.max(Number.parseInt(query.limit ?? "20", 10) || 20, 1), 100);

        const qb = deliveryRepo
          .createQueryBuilder("d")
          .where("d.integration_id = :integrationId", { integrationId: params.id });

        if (query.event_type) {
          qb.andWhere("d.event_type = :event_type", { event_type: query.event_type });
        }
        if (query.status) {
          qb.andWhere("d.status = :status", { status: query.status });
        }
        if (query.direction) {
          qb.andWhere("d.direction = :direction", { direction: query.direction });
        }

        if (query.cursor) {
          const decoded = decodeURIComponent(query.cursor);
          const [ca, id] = decoded.split("|");
          qb.andWhere("(d.created_at < :ca OR (d.created_at = :ca AND d.id < :id))", { ca, id });
        }

        qb.orderBy("d.created_at", "DESC")
          .addOrderBy("d.id", "DESC")
          .limit(limit + 1);

        const rows = await qb.getMany();
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;

        let next_cursor: string | null = null;
        if (hasMore && items.length > 0) {
          const last = items[items.length - 1];
          const ts =
            last.created_at instanceof Date
              ? last.created_at.toISOString()
              : String(last.created_at);
          next_cursor = encodeURIComponent(`${ts}|${last.id}`);
        }

        const mapped = items.map((d: any) => ({
          id: d.id,
          integration_id: d.integration_id,
          event_type: d.event_type,
          direction: d.direction,
          status: d.status,
          status_code: d.response_status,
          request_body: d.request_body,
          response_body: d.response_body,
          signed_headers: d.request_headers,
          attempts: d.attempt,
          error_message: d.error_message,
          created_at: d.created_at instanceof Date ? d.created_at.toISOString() : d.created_at,
        }));

        return ok({ items: mapped, next_cursor });
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({
          event_type: t.Optional(t.String()),
          status: t.Optional(t.String()),
          direction: t.Optional(t.Union([t.Literal("outbound"), t.Literal("inbound")])),
          limit: t.Optional(t.String()),
          cursor: t.Optional(t.String()),
        }),
      },
    ),
  );
