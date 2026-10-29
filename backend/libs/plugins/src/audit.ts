import { AppDataSource, AuditLog } from "@materialhub/database";
import { Elysia } from "elysia";

interface AuditContext {
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
    const { request, audit } = ctx;
    if (audit.skip) return;

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!shouldAudit(method, path, audit.force ?? false)) return;

    const actor = (ctx as any).user ?? null;
    const resolvedActorId = audit.actor_id !== undefined ? audit.actor_id : (actor?.id ?? null);
    const resolvedActorRole = audit.actor_role ?? actor?.role ?? "system";

    const entry: Partial<AuditLog> = {
      actor_id: resolvedActorId,
      actor_role: resolvedActorRole,
      action: audit.action ?? inferAction(method, path),
      entity_type: audit.entity_type ?? inferEntityType(path),
      entity_id: audit.entity_id ?? inferEntityId(path) ?? undefined,
      changes: (audit.changes as any) ?? null,
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: request.headers.get("user-agent")?.substring(0, 512) ?? null,
      metadata: (audit.metadata as any) ?? null,
    };

    // Fire-and-forget — don't block the response
    const repo = AppDataSource.getRepository(AuditLog);
    repo.save(repo.create(entry)).catch((err) => {
      console.error(
        JSON.stringify({ level: "error", message: "Audit log write failed", error: err.message }),
      );
    });
  });
