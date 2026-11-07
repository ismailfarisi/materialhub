import { Elysia } from "elysia";

// ─── Typed HTTP Errors ──────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    /** Optional structured payload surfaced to the client (e.g. rate-limit metadata). */
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message, "BAD_REQUEST");
  }
}

/**
 * A list filter that must be one of an enum's values. An unknown value is a
 * 400 naming the allowed values, not a Postgres enum cast error (500).
 */
export function assertEnumFilter<T extends string>(
  value: string | undefined | null,
  allowed: Record<string, T> | readonly T[],
  name = "status",
): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const values = (Array.isArray(allowed) ? allowed : Object.values(allowed)) as readonly string[];
  if (!values.includes(value)) {
    throw new HttpError(
      400,
      `Invalid ${name} '${value}'. Use one of: ${values.join(", ")}`,
      "INVALID_FILTER",
    );
  }
  return value as T;
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message, "NOT_FOUND");
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(403, message, "FORBIDDEN");
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(409, message, "CONFLICT", details);
  }
}

export class UnprocessableEntityError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(422, message, "UNPROCESSABLE_ENTITY", details);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(429, message, "TOO_MANY_REQUESTS", details);
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message: string) {
    super(503, message, "SERVICE_UNAVAILABLE");
  }
}

// These plugin re-exports pull heavier deps (redis, @materialhub/database). Keep them
// AFTER the dependency-free error classes above so the class bindings are fully
// initialized before any heavy submodule loads — avoids a "cannot access X before
// initialization" TDZ race when many files import @materialhub/plugins concurrently.
export { rateLimiter } from "./rate-limiter.ts";
export { auditPlugin, redactSecrets } from "./audit.ts";
export type { AuditContext } from "./audit.ts";

/**
 * Request logging plugin — adds correlation ID and logs requests.
 */
export const requestLogger = new Elysia({ name: "request-logger" })
  .derive({ as: "global" }, () => {
    const correlationId = crypto.randomUUID();
    return { correlationId };
  })
  .onBeforeHandle({ as: "global" }, ({ request, correlationId }) => {
    // TODO: Replace with Winston logger for transport/level support (see CLAUDE.md)
    console.log(
      JSON.stringify({
        level: "info",
        correlationId,
        method: request.method,
        url: request.url,
        timestamp: new Date().toISOString(),
      }),
    );
  })
  .onAfterHandle({ as: "global" }, ({ correlationId, set }) => {
    set.headers["x-correlation-id"] = correlationId;
  });

/**
 * Global error handler plugin — standardizes error responses.
 */
export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  { as: "scoped" },
  ({ code, error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.statusCode;
      return {
        statusCode: error.statusCode,
        message: error.message,
        error: error.code,
        ...(error.details !== undefined ? { details: error.details } : {}),
        timestamp: new Date().toISOString(),
      };
    }

    const statusCode =
      code === "NOT_FOUND" ? 404 : code === "VALIDATION" ? 400 : code === "PARSE" ? 400 : 500;

    set.status = statusCode;

    // Never leak internal error details on 500 — log them instead
    const isServerError = statusCode === 500;
    if (isServerError) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "message" in error ? (error as Error).message : "Unknown error",
          stack: "stack" in error ? (error as Error).stack : undefined,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return {
      statusCode,
      message: isServerError
        ? "Internal server error"
        : "message" in error
          ? (error as Error).message
          : "Internal server error",
      error: code,
      timestamp: new Date().toISOString(),
    };
  },
);
