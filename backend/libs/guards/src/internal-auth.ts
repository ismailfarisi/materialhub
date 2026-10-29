import { Elysia } from "elysia";

/**
 * Internal auth guard — validates the shared secret header used for
 * service-to-service calls. The secret is read from the
 * `INTERNAL_SHARED_SECRET` env var and compared against the
 * `x-internal-secret` request header. If either is missing or they
 * do not match, the request is rejected with 401.
 */
export const internalAuth = new Elysia({ name: "internal-auth" }).onBeforeHandle(
  ({ request, set }) => {
    const expected = process.env.INTERNAL_SHARED_SECRET ?? "";
    const got = request.headers.get("x-internal-secret") ?? "";
    if (!expected || got !== expected) {
      set.status = 401;
      return { error: "internal_auth_failed" };
    }
  },
);
