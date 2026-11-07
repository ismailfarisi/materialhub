import { AppDataSource, AuditLog } from "@materialhub/database";
import { Elysia } from "elysia";

export interface AuditContext {
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor_id?: string | null;
  actor_role?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  skip?: boolean;
  /** Force audit emission even on GET — used for export/download endpoints. */
  force?: boolean;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Prefixes that trigger auto-capture for non-GET requests */
const AUDIT_PREFIXES = [
  "/admin",
  "/vendor",
  "/pages",
  "/banners",
  "/settings",
  "/auth",
  "/support",
  "/bulk",
];

function isAuditedPath(path: string): boolean {
  return AUDIT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function shouldAudit(method: string, path: string, force: boolean): boolean {
  // `force` bypasses BOTH the GET/HEAD/OPTIONS filter and the prefix allowlist —
  // for routes outside the standard /admin, /vendor, /auth, etc. namespaces
  // (e.g. customer-initiated /orders/:id/dispute) that still need audit coverage.
  if (force) return true;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  return isAuditedPath(path);
}

function inferAction(method: string, path: string): string {
  const segments = path.split("/").filter(Boolean);
  const meaningful = segments.filter((s) => !UUID_RE.test(s) && !["admin", "vendor"].includes(s));
  const resource = meaningful[0] || "unknown";
  const subAction = meaningful[1];

  if (subAction) return `${resource}.${subAction}`;

  switch (method) {
    case "POST":
      return `${resource}.create`;
    case "PUT":
    case "PATCH":
      return `${resource}.update`;
    case "DELETE":
      return `${resource}.delete`;
    default:
      return `${resource}.${method.toLowerCase()}`;
  }
}

function inferEntityType(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const meaningful = segments.filter((s) => !UUID_RE.test(s) && !["admin", "vendor"].includes(s));
  return meaningful[0] || "unknown";
}

function inferEntityId(path: string): string | null {
  const match = path.match(UUID_RE);
  return match ? match[0] : null;
}

const UUID_EXACT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id of the row a create returned (`{ data: { id } }` envelope or a bare
 * `{ id }`), so audit rows for POST /x carry the new entity's id.
 */
export function responseEntityId(response: unknown): string | null {
  const r = response as { id?: unknown; data?: { id?: unknown } } | null | undefined;
  const id = r?.data?.id ?? r?.id;
  return typeof id === "string" && UUID_EXACT_RE.test(id) ? id : null;
}

const SECRET_KEY_RE =
  /(secret|password|passwd|token|api[_-]?key|private[_-]?key|credential|client[_-]?secret|signing[_-]?key|webhook[_-]?key)/i;

/**
 * Audit payloads must never carry secrets: values under secret-looking keys
 * (at any depth) are replaced by "[redacted]"; the key itself stays so the
 * log still shows *what* changed.
 */
export function redactSecrets<T>(value: T, depth = 0): T {
  if (value === null || typeof value !== "object" || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : redactSecrets(v, depth + 1);
  }
  return out as T;
}

/** First X-Forwarded-For entry (the gateway appends the socket peer); never the "unknown" placeholder. */
export function clientIpFrom(headers: Headers): string | null {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!first || first.toLowerCase() === "unknown") return null;
  return first.slice(0, 45);
}

/** The row the plugin writes for one request, or null when it isn't audited. */
export function buildAuditEntry(input: {
  request: Request;
  audit: AuditContext;
  user?: { id?: string; role?: string } | null;
  response?: unknown;
}): Partial<AuditLog> | null {
  const { request, audit } = input;
  if (audit.skip) return null;

  const path = new URL(request.url).pathname;
  const method = request.method;
  if (!shouldAudit(method, path, audit.force ?? false)) return null;

  const actor = input.user ?? null;
  const resolvedActorId = audit.actor_id !== undefined ? audit.actor_id : (actor?.id ?? null);
  const resolvedActorRole = audit.actor_role ?? actor?.role ?? "system";
  // entity_id is a uuid column: a natural key ("store_name", "cod", "google")
  // would fail the insert and silently drop the row, so it goes in metadata.
  const explicitId = audit.entity_id ?? null;
  const explicitIsUuid = !!explicitId && UUID_EXACT_RE.test(explicitId);
  const entityId =
    (explicitIsUuid ? explicitId : null) ??
    inferEntityId(path) ??
    (method === "POST" ? responseEntityId(input.response) : null);
  const metadata =
    explicitId && !explicitIsUuid
      ? { ...(audit.metadata ?? {}), entity_key: explicitId }
      : audit.metadata;

  return {
    actor_id: resolvedActorId,
    actor_role: resolvedActorRole,
    action: audit.action ?? inferAction(method, path),
    entity_type: audit.entity_type ?? inferEntityType(path),
    entity_id: entityId ?? undefined,
    changes: audit.changes ? (redactSecrets(audit.changes) as any) : null,
    ip_address: clientIpFrom(request.headers),
    user_agent: request.headers.get("user-agent")?.substring(0, 512) ?? null,
    metadata: metadata ? (redactSecrets(metadata) as any) : null,
  };
}

export const auditPlugin = new Elysia({ name: "audit-logger" })
  .derive({ as: "scoped" }, () => ({
    audit: {
      action: undefined,
      entity_type: undefined,
      entity_id: undefined,
      actor_id: undefined,
      actor_role: undefined,
      changes: undefined,
      metadata: undefined,
      skip: false,
      force: false,
    } as AuditContext,
  }))
  .onAfterHandle({ as: "scoped" }, (ctx) => {
    const entry = buildAuditEntry({
      request: ctx.request,
      audit: ctx.audit,
      user: (ctx as any).user ?? null,
      response: (ctx as any).responseValue ?? (ctx as any).response,
    });
    if (!entry) return;

    // Fire-and-forget — don't block the response
    const repo = AppDataSource.getRepository(AuditLog);
    repo.save(repo.create(entry)).catch((err) => {
      console.error(
        JSON.stringify({ level: "error", message: "Audit log write failed", error: err.message }),
      );
    });
  });
