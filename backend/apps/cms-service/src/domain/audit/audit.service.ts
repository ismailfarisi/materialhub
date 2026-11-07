import { AppDataSource, AuditLog, User } from "@materialhub/database";
import type { AuditLogQuery } from "@materialhub/dto";
import { HttpError } from "@materialhub/plugins";
import { In } from "typeorm";

export type AuditListQuery = AuditLogQuery & {
  /** Free text matched against the actor's email or name. */
  actor?: string;
};

export interface AuditActor {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filter bound from a date input ("2026-11-07", read as a UAE calendar day)
 * or a full ISO date-time. `end` makes a bare date inclusive of that day.
 */
export function parseAuditDate(value: string, end = false): Date {
  const d = DATE_ONLY_RE.test(value)
    ? new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}+04:00`)
    : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, `Invalid date: ${value}`, "INVALID_DATE");
  }
  return d;
}

/**
 * Actions are stored as "<entity>.<verb>" ("categories.create",
 * "user.login_2fa"). A bare verb filter ("create", "login") matches that verb
 * on any entity, including suffixed variants; a dotted filter is a prefix.
 */
export function actionFilterSql(action: string): { sql: string; params: Record<string, string> } {
  const escaped = action.replace(/[\\%_]/g, (c) => `\\${c}`);
  if (action.includes(".")) {
    return { sql: "a.action LIKE :actionPrefix", params: { actionPrefix: `${escaped}%` } };
  }
  return {
    sql: "(a.action = :actionExact OR a.action LIKE :actionVerb OR a.action LIKE :actionVerbVariant)",
    params: {
      actionExact: action,
      actionVerb: `%.${escaped}`,
      actionVerbVariant: `%.${escaped}\\_%`,
    },
  };
}

/** Attach `actor` (name + email) to rows by actor_id; rows without a user stay `actor: null`. */
export function attachActors<T extends { actor_id: string | null }>(
  rows: T[],
  actors: AuditActor[],
): Array<T & { actor: AuditActor | null }> {
  const byId = new Map(actors.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, actor: (r.actor_id && byId.get(r.actor_id)) || null }));
}

export class AuditService {
  private get repo() {
    return AppDataSource.getRepository(AuditLog);
  }
  private get userRepo() {
    return AppDataSource.getRepository(User);
  }

  async list(query: AuditListQuery) {
    const {
      page = 1,
      limit = 20,
      actor_id,
      actor,
      action,
      entity_type,
      date_from,
      date_to,
    } = query;

    const qb = this.repo
      .createQueryBuilder("a")
      .orderBy("a.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (actor_id) qb.andWhere("a.actor_id = :actor_id", { actor_id });
    const actorText = actor?.trim();
    if (actorText) {
      qb.andWhere(
        `a.actor_id IN (SELECT u.id FROM users u WHERE u.email ILIKE :actorText
           OR (u.first_name || ' ' || u.last_name) ILIKE :actorText)`,
        { actorText: `%${actorText.replace(/[\\%_]/g, (c) => `\\${c}`)}%` },
      );
    }
    if (action) {
      const f = actionFilterSql(action);
      qb.andWhere(f.sql, f.params);
    }
    if (entity_type) qb.andWhere("a.entity_type = :entity_type", { entity_type });
    if (date_from)
      qb.andWhere("a.created_at >= :date_from", { date_from: parseAuditDate(date_from) });
    if (date_to)
      qb.andWhere("a.created_at <= :date_to", { date_to: parseAuditDate(date_to, true) });

    const [rows, total] = await qb.getManyAndCount();
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id))];
    const actors = actorIds.length
      ? await this.userRepo.find({
          where: { id: In(actorIds) },
          select: ["id", "email", "first_name", "last_name"],
          withDeleted: true,
        })
      : [];
    return { data: attachActors(rows, actors as AuditActor[]), total, page, limit };
  }

  /** Entity types that actually occur, for the admin filter (stored values, e.g. "categories"). */
  async facets(): Promise<{ entity_types: string[] }> {
    const rows: Array<{ entity_type: string }> = await this.repo
      .createQueryBuilder("a")
      .select("DISTINCT a.entity_type", "entity_type")
      .orderBy("a.entity_type", "ASC")
      .limit(200)
      .getRawMany();
    return { entity_types: rows.map((r) => r.entity_type).filter(Boolean) };
  }
}
