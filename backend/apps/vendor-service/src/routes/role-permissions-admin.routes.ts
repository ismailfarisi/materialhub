import { AppDataSource } from "@materialhub/database";
import {
  PERMISSIONS,
  bumpMatrixVersion,
  isPermission,
  jwtAuth,
  requireRole,
} from "@materialhub/guards";
import { Elysia, t } from "elysia";

const ROLES = ["owner", "manager", "staff", "viewer"] as const;
type Role = (typeof ROLES)[number];

export const rolePermissionsAdminRoutes = new Elysia({ prefix: "/admin/role-permissions" })
  .use(jwtAuth)
  .use(requireRole("super_admin"))
  .get("/", async () => {
    const rows = (await AppDataSource.query(
      "SELECT role, permission, updated_at, updated_by_user_id FROM role_permissions",
    )) as Array<{
      role: Role;
      permission: string;
      updated_at: string;
      updated_by_user_id: string | null;
    }>;

    const matrix: Record<Role, string[]> = {
      owner: [],
      manager: [],
      staff: [],
      viewer: [],
    };
    for (const row of rows) {
      if (matrix[row.role]) matrix[row.role].push(row.permission);
    }

    let lastUpdatedAt: string | null = null;
    let lastUpdatedBy: { userId: string; name: string } | null = null;
    if (rows.length > 0) {
      const latest = rows.reduce((a, b) =>
        new Date(a.updated_at) > new Date(b.updated_at) ? a : b,
      );
      lastUpdatedAt = latest.updated_at;
      if (latest.updated_by_user_id) {
        const userRows = (await AppDataSource.query(
          `SELECT id, COALESCE(first_name || ' ' || last_name, email) AS name FROM users WHERE id = $1`,
          [latest.updated_by_user_id],
        )) as Array<{ id: string; name: string }>;
        if (userRows[0]) lastUpdatedBy = { userId: userRows[0].id, name: userRows[0].name };
      }
    }

    return {
      statusCode: 200,
      data: {
        matrix,
        catalog: PERMISSIONS,
        lastUpdatedAt,
        lastUpdatedBy,
      },
      timestamp: new Date().toISOString(),
    };
  })
  .put(
    "/:role",
    async ({ params, body, user, set }) => {
      const role = params.role as Role;
      if (!ROLES.includes(role)) {
        set.status = 422;
        return {
          statusCode: 422,
          error: "INVALID_ROLE",
          message: `Unknown role: ${params.role}`,
          timestamp: new Date().toISOString(),
        };
      }

      const unknown = body.permissions.filter((p) => !isPermission(p));
      if (unknown.length > 0) {
        set.status = 422;
        return {
          statusCode: 422,
          error: "UNKNOWN_PERMISSION",
          message: `Unknown permissions: ${unknown.join(", ")}`,
          unknown,
          timestamp: new Date().toISOString(),
        };
      }

      const desired = new Set(body.permissions);
      if (role === "owner") {
        const missing = PERMISSIONS.filter((p) => !desired.has(p));
        if (missing.length > 0) {
          set.status = 422;
          return {
            statusCode: 422,
            error: "OWNER_PERMISSIONS_LOCKED",
            message: "Owner must have every permission",
            missing,
            timestamp: new Date().toISOString(),
          };
        }
      }

      const before: string[] = await AppDataSource.transaction(async (em) => {
        const beforeRows = (await em.query(
          "SELECT permission FROM role_permissions WHERE role = $1 ORDER BY permission",
          [role],
        )) as Array<{ permission: string }>;
        await em.query("DELETE FROM role_permissions WHERE role = $1", [role]);
        for (const perm of body.permissions) {
          await em.query(
            `INSERT INTO role_permissions (id, role, permission, updated_by_user_id, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())`,
            [role, perm, user!.id],
          );
        }
        return beforeRows.map((r) => r.permission);
      });

      // Audit log
      await AppDataSource.query(
        `INSERT INTO audit_log
           (id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at)
         VALUES (gen_random_uuid(), $1, 'super_admin', 'role_permissions.updated', 'role_permissions', NULL, $2::jsonb, NOW())`,
        [user!.id, JSON.stringify({ role, before, after: [...body.permissions].sort() })],
      );

      // INCR matrix_version so all processes reload within ≤30s
      await bumpMatrixVersion();

      return {
        statusCode: 200,
        message: "Role permissions updated",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({ role: t.String() }),
      body: t.Object({ permissions: t.Array(t.String()) }),
    },
  );
