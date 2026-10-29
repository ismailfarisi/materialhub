import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const inboundRoutes = new Elysia({ prefix: "/integrations/inbound" }).use(container).post(
  "/:id/:event_type",
  async ({ params, request, inboundService, siteSettingRepo, set, server }: any) => {
    const flag = await siteSettingRepo.findOne({
      where: { key: "vendor_integrations_inbound_enabled" } as any,
    });
    if (flag?.value !== "true") {
      set.status = 503;
      return { statusCode: 503, error: "INBOUND_DISABLED" };
    }

    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((v: string, k: string) => {
      headers[k] = v;
    });
    const sourceIp =
      headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
      request.headers.get("cf-connecting-ip") ??
      server?.requestIP?.(request)?.address ??
      "0.0.0.0";

    const result = await inboundService.handle({
      integrationId: params.id,
      eventType: params.event_type,
      sourceIp,
      headers,
      rawBody,
    });
    set.status = result.status;
    return result.body;
  },
  {
    params: t.Object({ id: t.String(), event_type: t.String() }),
  },
);
