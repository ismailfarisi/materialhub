import { config } from "@materialhub/config";
import { Elysia, t } from "elysia";
import jwt from "jsonwebtoken";
import { container } from "../container.ts";

interface PreviewTokenPayload {
  bid_id?: string;
  layout_id?: string;
  version?: "draft";
  requestor?: "admin" | "vendor";
  aud?: string;
}

export const layoutResolveRoutes = new Elysia({ prefix: "/layouts" })
  .use(container)

  .get(
    "/:slug/resolve",
    async ({ params, query, layoutResolverController, set }) => {
      let previewBidId: string | undefined;
      let previewLayoutId: string | undefined;

      if (query.preview_token) {
        try {
          const payload = jwt.verify(
            query.preview_token,
            config.jwt.accessSecret,
          ) as PreviewTokenPayload;
          if (payload?.aud !== "preview") {
            throw new Error("INVALID_AUD");
          }
          if (typeof payload.bid_id === "string") {
            previewBidId = payload.bid_id;
          } else if (typeof payload.layout_id === "string" && payload.version === "draft") {
            previewLayoutId = payload.layout_id;
          } else {
            throw new Error("INVALID_TOKEN_SHAPE");
          }
        } catch {
          set.status = 401;
          return {
            statusCode: 401,
            error: "PREVIEW_TOKEN_INVALID",
            message: "Preview token is invalid or expired.",
            timestamp: new Date().toISOString(),
          };
        }
        set.headers["cache-control"] = "no-store";
      }

      const data = await layoutResolverController.resolve(
        params.slug,
        query.locale || "en",
        query.device || "web",
        previewBidId,
        query.context_vendor_id,
        previewLayoutId,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ slug: t.String() }),
      query: t.Object({
        locale: t.Optional(t.String()),
        device: t.Optional(t.Union([t.Literal("web"), t.Literal("mobile")])),
        preview_token: t.Optional(t.String()),
        context_vendor_id: t.Optional(t.String({ format: "uuid" })),
      }),
    },
  );
