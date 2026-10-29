import { AppDataSource, AuditLog } from "@materialhub/database";
import type { AuditLogQuery } from "@materialhub/dto";

export class AuditService {
  private get repo() {
    return AppDataSource.getRepository(AuditLog);
  }

  async list(query: AuditLogQuery) {
    const { page = 1, limit = 20, actor_id, action, entity_type, date_from, date_to } = query;

    const qb = this.repo
      .createQueryBuilder("a")
      .orderBy("a.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (actor_id) qb.andWhere("a.actor_id = :actor_id", { actor_id });
    if (action) qb.andWhere("a.action LIKE :action", { action: `${action}%` });
    if (entity_type) qb.andWhere("a.entity_type = :entity_type", { entity_type });
    if (date_from) qb.andWhere("a.created_at >= :date_from", { date_from: new Date(date_from) });
    if (date_to) qb.andWhere("a.created_at <= :date_to", { date_to: new Date(date_to) });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
