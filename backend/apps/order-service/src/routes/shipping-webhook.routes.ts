import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import type { WebhookEvent } from "../domain/shipment/shipping-provider-adapter.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});
const err = (status: number, error: string, message: string) => ({
  statusCode: status,
  error,
  message,
  timestamp: new Date().toISOString(),
});

export const shippingWebhookRoutes = new Elysia({ prefix: "/webhooks/shipping" })
  .use(container)
  .post(
    "/:provider_code",
    async ({
      params,
      request,
      shippingProviderRepo,
      shippingProviderRegistry,
      shipmentRepo,
      shipmentTrackingService,
      encryption,
      set,
    }: any) => {
      const provider = await shippingProviderRepo.findOne({
        where: { code: params.provider_code, deleted_at: null as any },
      });
      if (!provider || !provider.is_active) {
        set.status = 404;
        return err(404, "PROVIDER_NOT_FOUND", "Provider not available");
      }
      const adapter = shippingProviderRegistry.get(params.provider_code);
      if (!adapter) {
        set.status = 404;
        return err(
          404,
          "ADAPTER_NOT_REGISTERED",
          `Adapter '${params.provider_code}' not registered`,
        );
      }
      const rawBody = await request.text();
      const secret = provider.webhook_secret_encrypted
        ? encryption.decrypt(provider.webhook_secret_encrypted)
        : null;
      if (!adapter.verifyWebhook(request.headers, rawBody, secret)) {
        set.status = 401;
        return err(401, "INVALID_SIGNATURE", "Webhook signature verification failed");
      }
      let event: WebhookEvent;
      try {
        event = adapter.parseWebhookEvent(rawBody);
      } catch (e) {
        set.status = 400;
        return err(400, "PARSE_ERROR", `Webhook body could not be parsed: ${(e as Error).message}`);
      }
      const shipment = await shipmentRepo.findOne({
        where: { external_shipment_id: event.external_shipment_id },
      });
      if (!shipment) {
        set.status = 202;
        return ok({ ingested: false, reason: "unknown_shipment" });
      }
      await shipmentTrackingService.processWebhookEvent({
        tracking_number: shipment.tracking_number ?? event.external_shipment_id,
        provider_id: provider.id,
        external_event_id: event.external_event_id,
        status: event.status,
        location: event.location ?? undefined,
        description: event.description ?? undefined,
        occurred_at: event.occurred_at.toISOString(),
        raw_payload: event.raw as Record<string, unknown>,
      });
      return ok({ ingested: true });
    },
    { params: t.Object({ provider_code: t.String() }) },
  );
