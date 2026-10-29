import { randomBytes } from "node:crypto";
import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { bumpTokenVersion } from "@materialhub/guards";
import { HttpError } from "@materialhub/plugins";
import type { EmailService } from "@materialhub/utils";
import { assertNonOwnerRole, normalizeEmail } from "./vendor-member.validators.ts";

export type VendorMemberRole = "owner" | "manager" | "staff" | "viewer";
export type VendorMemberStatus = "pending" | "active" | "revoked";

export interface InviteInput {
  vendorId: string;
  email: string;
  role: Exclude<VendorMemberRole, "owner">;
  invitedByUserId: string;
}

export interface MemberListRow {
  id: string;
  user_id: string | null;
  email: string;
  role: VendorMemberRole;
  status: VendorMemberStatus;
  invite_expires_at: string | null;
  expired: boolean;
  joined_or_invited_at: string;
}

interface DataSourceLike {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  transaction: <T>(
    cb: (em: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>,
  ) => Promise<T>;
}

export class VendorMemberService {
  constructor(
    private readonly emailService: EmailService,
    private readonly dataSource: DataSourceLike = AppDataSource as unknown as DataSourceLike,
  ) {}

  async invite(input: InviteInput): Promise<{ memberId: string; expiresAt: Date }> {
    assertNonOwnerRole(input.role);
    const email = normalizeEmail(input.email);

    // Reject if there's already an active member with the same email
    const existingActive = (await this.dataSource.query(
      `SELECT vm.id FROM vendor_members vm
        JOIN users u ON u.id = vm.user_id
       WHERE vm.vendor_id = $1
         AND vm.status = 'active' AND vm.deleted_at IS NULL
         AND lower(u.email) = $2
       LIMIT 1`,
      [input.vendorId, email],
    )) as Array<{ id: string }>;
    if (existingActive.length > 0) {
      throw new HttpError(409, "User is already an active member", "ALREADY_MEMBER");
    }

    // Reject if there's already a pending invite for the same email
    const existingPending = (await this.dataSource.query(
      `SELECT id FROM vendor_members
        WHERE vendor_id = $1 AND lower(email) = $2
          AND status = 'pending' AND deleted_at IS NULL
        LIMIT 1`,
      [input.vendorId, email],
    )) as Array<{ id: string }>;
    if (existingPending.length > 0) {
      throw new HttpError(
        409,
        "A pending invite already exists for this email",
        "INVITE_ALREADY_PENDING",
      );
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const inserted = (await this.dataSource.query(
      `INSERT INTO vendor_members
         (id, vendor_id, email, role, status, invite_token,
          invite_expires_at, invited_by_user_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4, $5, $6, NOW(), NOW())
       RETURNING id`,
      [input.vendorId, email, input.role, token, expiresAt.toISOString(), input.invitedByUserId],
    )) as Array<{ id: string }>;

    const insertedRow = inserted[0];
    if (insertedRow == null) {
      throw new HttpError(500, "Failed to insert vendor member", "INSERT_FAILED");
    }

    // Build email context
    const ctx = (await this.dataSource.query(
      `SELECT v.business_name AS vendor_name,
              COALESCE(u.first_name || ' ' || u.last_name, u.email) AS inviter_name
         FROM vendors v, users u
        WHERE v.id = $1 AND u.id = $2`,
      [input.vendorId, input.invitedByUserId],
    )) as Array<{ vendor_name: string; inviter_name: string }>;
    const vendorName = ctx[0] != null ? ctx[0].vendor_name : "your vendor";
    const inviterName = ctx[0] != null ? ctx[0].inviter_name : "An owner";

    const acceptUrl = `${config.urls.vendorDashboard}/invite/${token}`;
    const declineUrl = `${config.urls.vendorDashboard}/invite/${token}/decline`;
    await this.emailService.sendVendorMemberInviteEmail(email, {
      inviterName,
      vendorName,
      role: input.role,
      acceptUrl,
      declineUrl,
      expiresInDays: 7,
    });

    await this.writeAudit({
      action: "member.invited",
      actorId: input.invitedByUserId,
      actorRole: "owner",
      entityId: insertedRow.id,
      metadata: { vendor_id: input.vendorId, email, role: input.role },
    });

    return { memberId: insertedRow.id, expiresAt };
  }

  async list(args: { vendorId: string }): Promise<MemberListRow[]> {
    const rows = (await this.dataSource.query(
      `SELECT vm.id, vm.user_id, vm.email, vm.role, vm.status,
              vm.invite_expires_at,
              CASE
                WHEN vm.status = 'pending' AND vm.invite_expires_at < NOW() THEN true
                ELSE false
              END AS expired,
              COALESCE(vm.accepted_at, vm.created_at) AS joined_or_invited_at
         FROM vendor_members vm
        WHERE vm.vendor_id = $1 AND vm.deleted_at IS NULL
          AND vm.status IN ('active', 'pending')
        ORDER BY vm.created_at ASC`,
      [args.vendorId],
    )) as MemberListRow[];
    return rows;
  }

  async changeRole(args: {
    vendorId: string;
    memberId: string;
    newRole: VendorMemberRole;
    actorUserId: string;
  }): Promise<void> {
    const rows = (await this.dataSource.query(
      `SELECT id, user_id, role FROM vendor_members
        WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`,
      [args.memberId, args.vendorId],
    )) as Array<{ id: string; user_id: string | null; role: VendorMemberRole }>;
    const target = rows[0];
    if (!target) throw new HttpError(404, "Member not found", "MEMBER_NOT_FOUND");

    if (target.user_id === args.actorUserId) {
      throw new HttpError(422, "Cannot change own role", "CANNOT_SELF_MODIFY");
    }
    if (target.role === "owner") {
      throw new HttpError(
        422,
        "Use transfer-ownership to change owner role",
        "CANNOT_DEMOTE_OWNER",
      );
    }
    assertNonOwnerRole(args.newRole); // owners are minted via transfer, not changeRole

    const beforeRole = target.role;
    await this.dataSource.query(
      "UPDATE vendor_members SET role = $1, updated_at = NOW() WHERE id = $2",
      [args.newRole, target.id],
    );

    if (target.user_id) await bumpTokenVersion(target.user_id);

    await this.writeAudit({
      action: "member.role_changed",
      actorId: args.actorUserId,
      actorRole: "owner",
      entityId: target.id,
      metadata: {
        vendor_id: args.vendorId,
        before_role: beforeRole,
        after_role: args.newRole,
      },
    });
  }

  async remove(args: {
    vendorId: string;
    memberId: string;
    actorUserId: string;
  }): Promise<void> {
    const rows = (await this.dataSource.query(
      `SELECT id, user_id, role, status FROM vendor_members
        WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL`,
      [args.memberId, args.vendorId],
    )) as Array<{
      id: string;
      user_id: string | null;
      role: VendorMemberRole;
      status: VendorMemberStatus;
    }>;
    const target = rows[0];
    if (!target) throw new HttpError(404, "Member not found", "MEMBER_NOT_FOUND");

    if (target.user_id === args.actorUserId && target.role === "owner") {
      throw new HttpError(
        422,
        "Owner cannot self-remove. Transfer ownership first.",
        "OWNER_CANNOT_SELF_REMOVE",
      );
    }

    await this.dataSource.query(
      `UPDATE vendor_members
          SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = $1, updated_at = NOW()
        WHERE id = $2`,
      [args.actorUserId, target.id],
    );

    if (target.status === "active" && target.user_id) {
      await bumpTokenVersion(target.user_id);
    }

    await this.writeAudit({
      action: "member.removed",
      actorId: args.actorUserId,
      actorRole: "owner",
      entityId: target.id,
      metadata: {
        vendor_id: args.vendorId,
        prior_status: target.status,
        prior_role: target.role,
      },
    });
  }

  async resendInvite(args: {
    vendorId: string;
    memberId: string;
    actorUserId: string;
  }): Promise<{ expiresAt: Date }> {
    const rows = (await this.dataSource.query(
      `SELECT vm.id, vm.email, vm.role, vm.status,
              v.business_name AS vendor_name,
              COALESCE(u.first_name || ' ' || u.last_name, u.email) AS inviter_name
         FROM vendor_members vm
         JOIN vendors v ON v.id = vm.vendor_id
         JOIN users u ON u.id = $3
        WHERE vm.id = $1 AND vm.vendor_id = $2 AND vm.deleted_at IS NULL`,
      [args.memberId, args.vendorId, args.actorUserId],
    )) as Array<{
      id: string;
      email: string;
      role: VendorMemberRole;
      status: VendorMemberStatus;
      vendor_name: string;
      inviter_name: string;
    }>;
    const target = rows[0];
    if (!target) throw new HttpError(404, "Member not found", "MEMBER_NOT_FOUND");
    if (target.status !== "pending") {
      throw new HttpError(422, "Cannot resend a non-pending invite", "INVITE_NOT_PENDING");
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.dataSource.query(
      `UPDATE vendor_members
          SET invite_token = $1, invite_expires_at = $2, updated_at = NOW()
        WHERE id = $3`,
      [token, expiresAt.toISOString(), target.id],
    );

    const acceptUrl = `${config.urls.vendorDashboard}/invite/${token}`;
    const declineUrl = `${config.urls.vendorDashboard}/invite/${token}/decline`;
    await this.emailService.sendVendorMemberInviteEmail(target.email, {
      inviterName: target.inviter_name,
      vendorName: target.vendor_name,
      role: target.role,
      acceptUrl,
      declineUrl,
      expiresInDays: 7,
    });

    await this.writeAudit({
      action: "member.invite_resent",
      actorId: args.actorUserId,
      actorRole: "owner",
      entityId: target.id,
      metadata: { vendor_id: args.vendorId, email: target.email },
    });

    return { expiresAt };
  }

  async transferOwnership(args: {
    vendorId: string;
    currentOwnerUserId: string;
    targetMemberId: string;
  }): Promise<void> {
    let targetUserId: string | null = null;

    await this.dataSource.transaction(async (em) => {
      // Lock target row
      const targetRows = (await em.query(
        `SELECT id, user_id, role, status FROM vendor_members
          WHERE id = $1 AND vendor_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [args.targetMemberId, args.vendorId],
      )) as Array<{
        id: string;
        user_id: string | null;
        role: VendorMemberRole;
        status: VendorMemberStatus;
      }>;
      const target = targetRows[0];
      if (!target) {
        throw new HttpError(404, "Target member not found in this vendor", "TARGET_NOT_OWN_VENDOR");
      }
      if (target.role !== "manager" || target.status !== "active" || !target.user_id) {
        throw new HttpError(
          422,
          "Ownership can only be transferred to an active manager",
          "TARGET_NOT_ACTIVE_MANAGER",
        );
      }

      // Lock current owner row
      const ownerRows = (await em.query(
        `SELECT id, user_id FROM vendor_members
          WHERE vendor_id = $1 AND role = 'owner' AND status = 'active' AND deleted_at IS NULL
          FOR UPDATE`,
        [args.vendorId],
      )) as Array<{ id: string; user_id: string }>;
      const owner = ownerRows[0];
      if (!owner || owner.user_id !== args.currentOwnerUserId) {
        throw new HttpError(403, "Caller is not the current owner", "NOT_CURRENT_OWNER");
      }

      // Step 1: demote current owner → manager (must come BEFORE promoting target,
      // otherwise the partial unique on (vendor_id) WHERE role='owner' AND status='active' fires).
      await em.query(
        `UPDATE vendor_members SET role = 'manager', updated_at = NOW() WHERE id = $1`,
        [owner.id],
      );

      // Step 2: promote target → owner
      await em.query(`UPDATE vendor_members SET role = 'owner', updated_at = NOW() WHERE id = $1`, [
        target.id,
      ]);

      // Phase 3b: vendors.user_id column is dropped — ownership lives entirely
      // in vendor_members, so no shim UPDATE is needed.

      targetUserId = target.user_id;
    });

    // Bump both users' token_version (outside the tx — Redis isn't 2PC with Postgres)
    await bumpTokenVersion(args.currentOwnerUserId);
    if (targetUserId) await bumpTokenVersion(targetUserId);

    await this.writeAudit({
      action: "vendor.ownership_transferred",
      actorId: args.currentOwnerUserId,
      actorRole: "owner",
      entityId: args.targetMemberId,
      metadata: {
        vendor_id: args.vendorId,
        from_user_id: args.currentOwnerUserId,
        to_user_id: targetUserId,
      },
    });
  }

  async previewInvite(token: string): Promise<{
    vendorName: string;
    role: VendorMemberRole;
    invitedEmail: string;
    expiresAt: string;
    status: VendorMemberStatus;
    expired: boolean;
  } | null> {
    const rows = (await this.dataSource.query(
      `SELECT vm.email, vm.role, vm.status, vm.invite_expires_at,
              v.business_name AS vendor_name
         FROM vendor_members vm
         JOIN vendors v ON v.id = vm.vendor_id
        WHERE vm.invite_token = $1 AND vm.deleted_at IS NULL`,
      [token],
    )) as Array<{
      email: string;
      role: VendorMemberRole;
      status: VendorMemberStatus;
      invite_expires_at: string;
      vendor_name: string;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      vendorName: row.vendor_name,
      role: row.role,
      invitedEmail: row.email,
      expiresAt: row.invite_expires_at,
      status: row.status,
      expired: row.status === "pending" && new Date(row.invite_expires_at) < new Date(),
    };
  }

  async acceptInvite(args: {
    token: string;
    authedUserId: string;
    authedEmail: string;
    emailVerified: boolean;
  }): Promise<void> {
    const rows = (await this.dataSource.query(
      `SELECT id, vendor_id, email, status, invite_expires_at FROM vendor_members
        WHERE invite_token = $1 AND deleted_at IS NULL`,
      [args.token],
    )) as Array<{
      id: string;
      vendor_id: string;
      email: string;
      status: VendorMemberStatus;
      invite_expires_at: string;
    }>;
    const row = rows[0];
    if (!row) throw new HttpError(404, "Invite not found", "INVITE_NOT_FOUND");
    if (row.status !== "pending") {
      throw new HttpError(409, "Invite already resolved", "INVITE_NOT_PENDING");
    }
    if (new Date(row.invite_expires_at) < new Date()) {
      throw new HttpError(410, "Invite has expired", "INVITE_EXPIRED");
    }
    if (!args.emailVerified) {
      throw new HttpError(
        422,
        "Verify your email before accepting an invite",
        "EMAIL_NOT_VERIFIED",
      );
    }
    if (row.email.toLowerCase() !== args.authedEmail.toLowerCase()) {
      throw new HttpError(409, "Invite is for a different email", "INVITE_EMAIL_MISMATCH");
    }

    await this.dataSource.query(
      `UPDATE vendor_members
          SET user_id = $1, status = 'active', accepted_at = NOW(),
              invite_token = NULL, updated_at = NOW()
        WHERE id = $2`,
      [args.authedUserId, row.id],
    );
    await bumpTokenVersion(args.authedUserId);
    await this.writeAudit({
      action: "member.accepted",
      actorId: args.authedUserId,
      actorRole: "owner", // any joining member's audit is keyed on the new active row
      entityId: row.id,
      metadata: { vendor_id: row.vendor_id },
    });
  }

  async declineInvite(token: string): Promise<void> {
    const rows = (await this.dataSource.query(
      `SELECT id, vendor_id FROM vendor_members
        WHERE invite_token = $1 AND status = 'pending' AND deleted_at IS NULL`,
      [token],
    )) as Array<{ id: string; vendor_id: string }>;
    const row = rows[0];
    if (!row) throw new HttpError(404, "Invite not found", "INVITE_NOT_FOUND");
    await this.dataSource.query(
      `UPDATE vendor_members
          SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [row.id],
    );
    await this.writeAudit({
      action: "member.declined",
      actorId: row.id, // No authed user; use member id as actor proxy
      actorRole: "system",
      entityId: row.id,
      metadata: { vendor_id: row.vendor_id, reason: "declined_by_recipient" },
    });
  }

  private async writeAudit(entry: {
    action: string;
    actorId: string;
    actorRole: string;
    entityId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO audit_log
         (id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'vendor_member', $4, $5::jsonb, NOW())`,
      [
        entry.actorId,
        entry.actorRole,
        entry.action,
        entry.entityId,
        JSON.stringify(entry.metadata),
      ],
    );
  }
}
