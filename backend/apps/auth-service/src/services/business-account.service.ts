// business-account.service.ts — company profile, members, invites and the
// net-terms application (roadmap item 4). Order approvals, invoices and the
// credit check at checkout live in order-service.
import {
  AppDataSource,
  BusinessAccount,
  BusinessCreditAccount,
  BusinessMember,
  BusinessMemberRole,
  BusinessMemberStatus,
  BusinessVerificationStatus,
  type NetTermsPeriod,
  NetTermsStatus,
  User,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { OVERDUE_NET_TERMS_SQL, isValidTrn } from "@materialhub/utils";
import type { EntityManager, Repository } from "typeorm";
import {
  type BusinessInput,
  assertBusinessRole,
  displayName,
  isBusinessRole,
  isoDate,
  normalizeBusinessInput,
  normalizeNetTermsApplication,
  toAccountView,
  toCreditView,
  touchesVerification,
} from "../domain/business-rules.ts";

export interface LicenceUrlSigner {
  getBusinessDocSignedUrl(key: string): Promise<{ url: string; expiresAt: Date }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class BusinessAccountService {
  constructor(
    private accounts: Repository<BusinessAccount> = AppDataSource.getRepository(BusinessAccount),
    private members: Repository<BusinessMember> = AppDataSource.getRepository(BusinessMember),
    private credits: Repository<BusinessCreditAccount> = AppDataSource.getRepository(
      BusinessCreditAccount,
    ),
    private users: Repository<User> = AppDataSource.getRepository(User),
    private signer?: LicenceUrlSigner,
  ) {}

  // ── Lookups ──────────────────────────────────────────────────────────

  async activeMembership(userId: string): Promise<BusinessMember | null> {
    return this.members.findOne({
      where: { user_id: userId, status: BusinessMemberStatus.active },
    });
  }

  private async requireMembership(userId: string): Promise<BusinessMember> {
    const m = await this.activeMembership(userId);
    if (!m) throw new HttpError(404, "You are not part of a business account", "NO_BUSINESS");
    return m;
  }

  private async overdue(businessAccountId: string): Promise<{ count: number; fils: number }> {
    const rows = await this.accounts.manager.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(o.grand_total - o.refund_total), 0)::bigint AS fils
         FROM orders o
        WHERE o.business_account_id = $1 AND ${OVERDUE_NET_TERMS_SQL}`,
      [businessAccountId],
    );
    return { count: Number(rows?.[0]?.count ?? 0), fils: Number(rows?.[0]?.fils ?? 0) };
  }

  private async creditView(businessAccountId: string) {
    const credit = await this.credits.findOne({
      where: { business_account_id: businessAccountId },
    });
    if (!credit) return null;
    return toCreditView(credit, await this.overdue(businessAccountId));
  }

  async pendingInvites(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user?.email) return [];
    const rows = await this.members.find({
      where: { email: user.email.toLowerCase(), status: BusinessMemberStatus.invited },
      relations: ["businessAccount"],
      order: { invited_at: "DESC" },
    });
    return rows
      .filter((r) => r.businessAccount && !r.businessAccount.deleted_at)
      .map((r) => ({
        id: r.id,
        business_account_id: r.business_account_id,
        legal_name: r.businessAccount.legal_name,
        role: r.role,
        invited_at: r.invited_at,
      }));
  }

  /** GET /auth/me/business */
  async getMine(userId: string) {
    const membership = await this.activeMembership(userId);
    if (!membership) {
      return {
        account: null,
        membership: null,
        credit: null,
        invites: await this.pendingInvites(userId),
      };
    }
    const account = await this.accounts.findOne({
      where: { id: membership.business_account_id },
    });
    if (!account) {
      return { account: null, membership: null, credit: null, invites: [] };
    }
    return {
      account: toAccountView(account),
      membership: { id: membership.id, role: membership.role, status: membership.status },
      credit: await this.creditView(account.id),
      invites: [],
    };
  }

  // ── Company profile ──────────────────────────────────────────────────

  async create(userId: string, input: BusinessInput) {
    if (await this.activeMembership(userId)) {
      throw new HttpError(400, "You already belong to a business account", "ALREADY_IN_BUSINESS");
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    const data = normalizeBusinessInput(
      { ...input, approval_threshold_fils: undefined },
      { partial: false, userId },
    );

    await AppDataSource.transaction(async (manager: EntityManager) => {
      const account = await manager.getRepository(BusinessAccount).save({
        ...data,
        verification_status: BusinessVerificationStatus.pending,
        created_by: userId,
      });
      await manager.getRepository(BusinessMember).save({
        business_account_id: account.id,
        user_id: userId,
        email: user.email?.toLowerCase() || `user-${userId}@no-email.invalid`,
        role: BusinessMemberRole.admin,
        status: BusinessMemberStatus.active,
        invited_by: userId,
        joined_at: new Date(),
      });
    });
    return this.getMine(userId);
  }

  async update(userId: string, input: BusinessInput) {
    const membership = await this.requireMembership(userId);
    assertBusinessRole(membership.role, "edit_profile");
    const account = await this.accounts.findOne({
      where: { id: membership.business_account_id },
    });
    if (!account) throw new HttpError(404, "Business account not found", "NOT_FOUND");

    const changes = normalizeBusinessInput(input, {
      partial: true,
      userId,
      existing: { vat_registered: account.vat_registered, trn: account.trn },
    });
    const reverify = touchesVerification(changes, account as unknown as Record<string, unknown>);
    Object.assign(account, changes);
    if (reverify && account.verification_status !== BusinessVerificationStatus.pending) {
      account.verification_status = BusinessVerificationStatus.pending;
      account.verified_at = null;
      account.verified_by = null;
      account.rejection_reason = null;
    }
    await this.accounts.save(account);
    return this.getMine(userId);
  }

  // ── Members and invites ──────────────────────────────────────────────

  async listMembers(userId: string) {
    const membership = await this.requireMembership(userId);
    const rows = await this.members.find({
      where: { business_account_id: membership.business_account_id },
      relations: ["user"],
      order: { invited_at: "ASC" },
    });
    return rows
      .filter((m) => m.status !== BusinessMemberStatus.removed)
      .map((m) => ({
        id: m.id,
        user_id: m.user_id,
        email: m.email,
        name: displayName(m.user),
        role: m.role,
        status: m.status,
        invited_at: m.invited_at,
        joined_at: m.joined_at,
      }));
  }

  async invite(userId: string, body: { email: string; role: string }) {
    const membership = await this.requireMembership(userId);
    assertBusinessRole(membership.role, "manage_members");
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 255) {
      throw new HttpError(400, "Enter a valid email address", "FIELD_INVALID");
    }
    if (!isBusinessRole(body.role)) throw new HttpError(400, "Choose a role", "FIELD_INVALID");

    const existing = await this.members.findOne({
      where: { business_account_id: membership.business_account_id, email },
    });
    if (existing && existing.status !== BusinessMemberStatus.removed) {
      throw new HttpError(400, "That person is already in your team or invited", "ALREADY_MEMBER");
    }
    await this.members.save({
      business_account_id: membership.business_account_id,
      email,
      role: body.role as BusinessMemberRole,
      status: BusinessMemberStatus.invited,
      invited_by: userId,
      invited_at: new Date(),
    });
    return this.listMembers(userId);
  }

  private async countAdmins(manager: EntityManager, businessAccountId: string): Promise<number> {
    return manager.getRepository(BusinessMember).count({
      where: {
        business_account_id: businessAccountId,
        role: BusinessMemberRole.admin,
        status: BusinessMemberStatus.active,
      },
    });
  }

  async changeRole(userId: string, memberId: string, role: string) {
    const membership = await this.requireMembership(userId);
    assertBusinessRole(membership.role, "manage_members");
    if (!isBusinessRole(role)) throw new HttpError(400, "Choose a role", "FIELD_INVALID");

    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BusinessMember);
      const target = await repo.findOne({
        where: { id: memberId, business_account_id: membership.business_account_id },
        lock: { mode: "pessimistic_write" },
      });
      if (!target || target.status === BusinessMemberStatus.removed) {
        throw new HttpError(404, "Member not found", "NOT_FOUND");
      }
      if (
        target.status === BusinessMemberStatus.active &&
        target.role === BusinessMemberRole.admin &&
        role !== "admin" &&
        (await this.countAdmins(manager, membership.business_account_id)) <= 1
      ) {
        throw new HttpError(400, "A business needs at least one admin", "LAST_ADMIN");
      }
      target.role = role as BusinessMemberRole;
      await repo.save(target);
    });
    return this.listMembers(userId);
  }

  async removeMember(userId: string, memberId: string) {
    const membership = await this.requireMembership(userId);
    assertBusinessRole(membership.role, "manage_members");
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BusinessMember);
      const target = await repo.findOne({
        where: { id: memberId, business_account_id: membership.business_account_id },
        lock: { mode: "pessimistic_write" },
      });
      if (!target || target.status === BusinessMemberStatus.removed) {
        throw new HttpError(404, "Member not found", "NOT_FOUND");
      }
      if (
        target.status === BusinessMemberStatus.active &&
        target.role === BusinessMemberRole.admin &&
        (await this.countAdmins(manager, membership.business_account_id)) <= 1
      ) {
        throw new HttpError(400, "A business needs at least one admin", "LAST_ADMIN");
      }
      target.status = BusinessMemberStatus.removed;
      target.removed_at = new Date();
      await repo.save(target);
    });
    return this.listMembers(userId);
  }

  private async findInviteFor(userId: string, inviteId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    const invite = await this.members.findOne({
      where: { id: inviteId, status: BusinessMemberStatus.invited },
    });
    // 404 (not 403) for someone else's invite so ids can't be probed.
    if (!user?.email || !invite || invite.email !== user.email.toLowerCase()) {
      throw new HttpError(404, "Invite not found", "NOT_FOUND");
    }
    return { user, invite };
  }

  async acceptInvite(userId: string, inviteId: string) {
    const { invite } = await this.findInviteFor(userId, inviteId);
    if (await this.activeMembership(userId)) {
      throw new HttpError(400, "You already belong to a business account", "ALREADY_IN_BUSINESS");
    }
    invite.user_id = userId;
    invite.status = BusinessMemberStatus.active;
    invite.joined_at = new Date();
    try {
      await this.members.save(invite);
    } catch (err) {
      // uq_business_members_active_user: a concurrent accept of another invite.
      if ((err as { code?: string })?.code === "23505") {
        throw new HttpError(400, "You already belong to a business account", "ALREADY_IN_BUSINESS");
      }
      throw err;
    }
    return this.getMine(userId);
  }

  async declineInvite(userId: string, inviteId: string) {
    const { invite } = await this.findInviteFor(userId, inviteId);
    invite.status = BusinessMemberStatus.removed;
    invite.removed_at = new Date();
    await this.members.save(invite);
    return this.getMine(userId);
  }

  // ── Net terms application ────────────────────────────────────────────

  async applyNetTerms(userId: string, body: Record<string, unknown>) {
    const membership = await this.requireMembership(userId);
    assertBusinessRole(membership.role, "apply_net_terms");
    const app = normalizeNetTermsApplication(body);
    const account = await this.accounts.findOne({
      where: { id: membership.business_account_id },
    });
    if (!account) throw new HttpError(404, "Business account not found", "NOT_FOUND");
    if (account.verification_status !== "verified") {
      throw new HttpError(
        400,
        "Net terms are available once your company is verified",
        "NOT_VERIFIED",
      );
    }
    const existing = await this.credits.findOne({
      where: { business_account_id: account.id },
    });
    if (existing && (existing.status === "approved" || existing.status === "applied")) {
      throw new HttpError(
        400,
        "You already have net terms or an open application",
        "TERMS_ALREADY_ACTIVE",
      );
    }
    if (existing && existing.status === "suspended") {
      throw new HttpError(400, "Net terms are suspended; contact MaterialHub", "TERMS_SUSPENDED");
    }
    // A rejected application can be re-submitted; the row is reused so the
    // outstanding balance (always 0 here) and history stay on one record.
    await this.credits.save({
      ...(existing ?? {}),
      business_account_id: account.id,
      terms: app.terms as NetTermsPeriod,
      requested_limit_fils: app.requested_limit_fils,
      application_note: app.note,
      status: NetTermsStatus.applied,
      applied_by: userId,
      applied_at: new Date(),
      decided_by: null,
      decided_at: null,
      decision_note: null,
    });
    return this.getMine(userId);
  }

  // ── Admin ────────────────────────────────────────────────────────────

  private async adminRow(a: BusinessAccount) {
    const [memberCount, owner, credit] = await Promise.all([
      this.members.count({
        where: { business_account_id: a.id, status: BusinessMemberStatus.active },
      }),
      this.users.findOne({ where: { id: a.created_by } }),
      this.creditView(a.id),
    ]);
    return {
      ...toAccountView(a),
      trn_format_valid: a.trn ? isValidTrn(a.trn) : false,
      licence_expired: a.trade_licence_expiry <= isoDate(new Date()),
      member_count: memberCount,
      owner: owner ? { id: owner.id, email: owner.email, name: displayName(owner) } : null,
      credit,
    };
  }

  async adminList(q: {
    status?: string;
    net_terms?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const qb = this.accounts
      .createQueryBuilder("b")
      .leftJoin(BusinessCreditAccount, "c", "c.business_account_id = b.id")
      .where("b.deleted_at IS NULL");
    if (q.status) qb.andWhere("b.verification_status = :status", { status: q.status });
    if (q.net_terms) qb.andWhere("c.status = :nt", { nt: q.net_terms });
    if (q.q?.trim()) {
      qb.andWhere(
        "(b.legal_name ILIKE :q OR b.trade_name ILIKE :q OR b.trn LIKE :q OR b.trade_licence_number ILIKE :q)",
        { q: `%${q.q.trim()}%` },
      );
    }
    // Work queue order: pending reviews and open applications first.
    qb.addSelect(
      `CASE WHEN b.verification_status = 'pending' OR c.status = 'applied' THEN 0 ELSE 1 END`,
      "review_first",
    )
      .orderBy("review_first", "ASC")
      .addOrderBy("b.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);
    const [rows, total] = await qb.getManyAndCount();
    const items = await Promise.all(rows.map((r) => this.adminRow(r)));
    return { items, total, page, limit };
  }

  async adminGet(id: string) {
    const a = await this.accounts.findOne({ where: { id } });
    if (!a) throw new HttpError(404, "Business account not found", "NOT_FOUND");
    const members = await this.members.find({
      where: { business_account_id: id },
      relations: ["user"],
      order: { invited_at: "ASC" },
    });
    return {
      ...(await this.adminRow(a)),
      members: members
        .filter((m) => m.status !== BusinessMemberStatus.removed)
        .map((m) => ({
          id: m.id,
          user_id: m.user_id,
          email: m.email,
          name: displayName(m.user),
          role: m.role,
          status: m.status,
          invited_at: m.invited_at,
          joined_at: m.joined_at,
        })),
    };
  }

  async adminLicenceUrl(id: string) {
    const a = await this.accounts.findOne({ where: { id } });
    if (!a?.trade_licence_document_key) {
      throw new HttpError(404, "No licence document uploaded", "NOT_FOUND");
    }
    if (!this.signer) throw new HttpError(503, "Document storage is not configured", "UNAVAILABLE");
    const { url } = await this.signer.getBusinessDocSignedUrl(a.trade_licence_document_key);
    return { url };
  }

  async adminVerify(adminId: string, id: string, body: { decision: string; reason?: string }) {
    const a = await this.accounts.findOne({ where: { id } });
    if (!a) throw new HttpError(404, "Business account not found", "NOT_FOUND");
    if (body.decision === "verified") {
      if (a.vat_registered && !isValidTrn(a.trn)) {
        throw new HttpError(400, "The TRN is not 15 digits", "TRN_INVALID");
      }
      a.verification_status = BusinessVerificationStatus.verified;
      a.verified_at = new Date();
      a.verified_by = adminId;
      a.rejection_reason = null;
    } else if (body.decision === "rejected") {
      const reason = body.reason?.trim();
      if (!reason) throw new HttpError(400, "Give a reason the buyer can act on", "FIELD_REQUIRED");
      a.verification_status = BusinessVerificationStatus.rejected;
      a.verified_at = null;
      a.verified_by = adminId;
      a.rejection_reason = reason.slice(0, 1000);
    } else {
      throw new HttpError(400, "decision must be verified or rejected", "FIELD_INVALID");
    }
    await this.accounts.save(a);
    return this.adminGet(id);
  }

  async adminDecideNetTerms(
    adminId: string,
    id: string,
    body: { decision: string; terms?: string; credit_limit_fils?: number; note?: string },
  ) {
    const a = await this.accounts.findOne({ where: { id } });
    if (!a) throw new HttpError(404, "Business account not found", "NOT_FOUND");

    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BusinessCreditAccount);
      let credit = await repo.findOne({
        where: { business_account_id: id },
        lock: { mode: "pessimistic_write" },
      });
      if (body.decision === "approved") {
        if (a.verification_status !== "verified") {
          throw new HttpError(400, "Verify the business before approving terms", "NOT_VERIFIED");
        }
        const limit = body.credit_limit_fils;
        if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) {
          throw new HttpError(400, "Set a credit limit", "FIELD_INVALID");
        }
        const terms = body.terms ?? credit?.terms ?? "net_30";
        if (terms !== "net_30" && terms !== "net_60") {
          throw new HttpError(400, "terms must be net_30 or net_60", "FIELD_INVALID");
        }
        // Admins may grant terms without an application (e.g. a pilot).
        credit =
          credit ??
          repo.create({ business_account_id: id, applied_by: adminId, applied_at: new Date() });
        credit.status = NetTermsStatus.approved;
        credit.terms = terms as NetTermsPeriod;
        credit.credit_limit_fils = limit;
      } else if (body.decision === "rejected" || body.decision === "suspended") {
        if (!credit) throw new HttpError(404, "No net-terms application", "NOT_FOUND");
        credit.status = body.decision as NetTermsStatus;
      } else {
        throw new HttpError(
          400,
          "decision must be approved, rejected or suspended",
          "FIELD_INVALID",
        );
      }
      credit.decided_by = adminId;
      credit.decided_at = new Date();
      credit.decision_note = body.note?.trim()?.slice(0, 1000) || null;
      await repo.save(credit);
    });
    return this.adminGet(id);
  }
}
