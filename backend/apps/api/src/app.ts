import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { config } from "@materialhub/config";
import { jwtAuth } from "@materialhub/guards";
import { errorHandler, rateLimiter, requestLogger } from "@materialhub/plugins";
import { serviceFetch } from "@materialhub/utils/src/service-fetch.ts";
import { Elysia } from "elysia";
import { proxyRequest, resolveUpstream } from "./proxy.ts";

/**
 * Compile the optional CORS preview-origin regex (STAGING ONLY).
 *
 * `new RegExp()` throws on a malformed pattern. Evaluated at module scope
 * inside the cors() config, that turned a typo'd env var into a boot crash
 * that restart-looped the whole gateway. Fails CLOSED instead: an invalid
 * pattern yields NO extra allowed origin, so the fixed allowlist below still
 * works and preview origins are simply rejected. Never fall back to
 * "allow everything" here — cors() runs with credentials: true.
 */
function previewOriginPatterns(): RegExp[] {
  const raw = process.env.CORS_PREVIEW_ORIGIN_PATTERN;
  if (!raw) return [];
  try {
    return [new RegExp(raw)];
  } catch (error) {
    console.error(
      `[cors] Ignoring invalid CORS_PREVIEW_ORIGIN_PATTERN (${raw}): ${
        error instanceof Error ? error.message : String(error)
      }. No preview origins will be allowed.`,
    );
    return [];
  }
}

export const app = new Elysia()
  .use(
    cors({
      origin: config.isProduction
        ? [
            process.env.ADMIN_PANEL_URL || "https://admin.materialhubuae.com",
            process.env.VENDOR_DASHBOARD_URL || "https://sellers.materialhubuae.com",
            process.env.WEB_URL || "https://materialhubuae.com",
            process.env.WEB_WWW_URL || "https://www.materialhubuae.com",
            // Optional extra-origin pattern (STAGING ONLY — never set in the
            // prod workflow): lets branch preview deploys (Vercel) call the
            // staging API from the browser. Anchored, team-scoped regex set
            // via env, e.g. ^https://ecom-[a-z0-9-]+-ismailfarisis-projects\.vercel\.app$
            ...previewOriginPatterns(),
          ]
        : true, // Allow all origins in development
      credentials: true,
    }),
  )
  .use(errorHandler)
  .use(requestLogger)
  .use(rateLimiter)
  .use(
    swagger({
      path: "/api/docs",
      documentation: {
        info: {
          title: "MaterialHub API",
          version: "0.1.0",
          description: "MaterialHub Multi-Vendor Marketplace API",
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
      },
    }),
  )
  .use(jwtAuth)
  // Health check — returns service statuses
  .get("/health", async () => {
    const services = ["auth", "product", "order", "vendor", "notification"] as const;
    const pathMap: Record<(typeof services)[number], string> = {
      auth: "auth",
      product: "products",
      order: "orders",
      vendor: "vendors",
      notification: "notifications",
    };
    const checks: Record<string, string> = {};

    await Promise.all(
      services.map(async (service) => {
        try {
          const res = await serviceFetch(`${config.serviceUrl[service]}/${pathMap[service]}/health`, {
            signal: AbortSignal.timeout(2000),
          });
          checks[service] = res.ok ? "up" : "down";
        } catch {
          checks[service] = "down";
        }
      }),
    );

    return {
      status: "ok",
      service: "api-gateway",
      timestamp: new Date().toISOString(),
      services: checks,
    };
  })
  // Catch-all proxy to upstream services
  .all("/*", async ({ request, correlationId }) => {
    const url = new URL(request.url);
    const upstream = resolveUpstream(url.pathname);

    if (!upstream) {
      return new Response(
        JSON.stringify({
          statusCode: 404,
          message: `No service handles ${url.pathname}`,
          error: "NOT_FOUND",
          timestamp: new Date().toISOString(),
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }

    try {
      return await proxyRequest(request, upstream.target, upstream.upstreamPath, correlationId);
    } catch {
      return new Response(
        JSON.stringify({
          statusCode: 502,
          message: "Service unavailable",
          error: "BAD_GATEWAY",
          timestamp: new Date().toISOString(),
        }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }
  });
