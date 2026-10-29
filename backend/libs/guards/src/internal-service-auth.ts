import { Elysia } from "elysia";
import jwt from "jsonwebtoken";

const ALLOWED_ISSUERS = new Set([
  "integration-service",
  "order-service",
  "product-service",
  "booking-service",
]);

type AuthError = "missing_token" | "secret_unset" | "invalid_issuer" | "invalid_token";

/**
 * Internal-service auth — validates a short-lived HS256 JWT signed with
 * `INTERNAL_SERVICE_SECRET` whose `iss` claim is one of the allowed services.
 * Use on `/internal/*` route groups via `.use(internalServiceAuth)`.
 */
export const internalServiceAuth = new Elysia({ name: "internal-service-auth" })
  .derive({ as: "scoped" }, ({ request }: any) => {
    const auth = request.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return {
        internalCaller: undefined as string | undefined,
        _internalAuthError: "missing_token" as AuthError | null,
      };
    }
    const token = auth.slice(7);
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (!secret) {
      return {
        internalCaller: undefined as string | undefined,
        _internalAuthError: "secret_unset" as AuthError | null,
      };
    }
    try {
      const payload = jwt.verify(token, secret) as { iss?: string };
      if (!payload.iss || !ALLOWED_ISSUERS.has(payload.iss)) {
        return {
          internalCaller: undefined as string | undefined,
          _internalAuthError: "invalid_issuer" as AuthError | null,
        };
      }
      return {
        internalCaller: payload.iss as string | undefined,
        _internalAuthError: null as AuthError | null,
      };
    } catch {
      return {
        internalCaller: undefined as string | undefined,
        _internalAuthError: "invalid_token" as AuthError | null,
      };
    }
  })
  .onBeforeHandle({ as: "scoped" }, ({ set, _internalAuthError }: any) => {
    if (_internalAuthError === "secret_unset") {
      set.status = 500;
      return { error: "INTERNAL_SERVICE_SECRET not configured" };
    }
    if (_internalAuthError) {
      set.status = 401;
      return { error: "internal_auth_failed", reason: _internalAuthError };
    }
  });
