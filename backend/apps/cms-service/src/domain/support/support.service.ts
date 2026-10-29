import {
  AppDataSource,
  SupportMessage,
  SupportTicket,
  TicketPriority,
  TicketStatus,
} from "@materialhub/database";
import type {
  CreateMessageBody,
  CreateTicketBody,
  TicketListQuery,
  UpdateTicketBody,
} from "@materialhub/dto";
import { HttpError } from "@materialhub/plugins";
import type { FindOptionsWhere } from "typeorm";
import { publishTicketMessage } from "../../lib/ticket-events.ts";
import type { SlackService } from "./slack.service.ts";

function generateTicketNumber(): string {
  const prefix = "TKT";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export type TicketIdentity = { userId: string | null; guestSession: string | null };

export class SupportService {
  constructor(private readonly slack?: SlackService) {}

  private get ticketRepo() {
    return AppDataSource.getRepository(SupportTicket);
  }

  private get messageRepo() {
    return AppDataSource.getRepository(SupportMessage);
  }

  private async relayToSlack(
    ticket: SupportTicket,
    text: string,
    authorLabel: string,
    origin: string,
    isInternal: boolean,
  ): Promise<void> {
    if (!this.slack || origin === "slack" || isInternal) return;
    try {
      const coords = await this.slack.postToThread(ticket, text, authorLabel);
      if (coords && !ticket.slack_thread_ts) {
        ticket.slack_thread_ts = coords.ts;
        ticket.slack_channel_id = coords.channel;
        await this.ticketRepo.save(ticket);
      }
    } catch {
      // Best-effort: a Slack relay failure must never fail the customer/admin reply.
    }
  }

  private ownerWhere(identity: TicketIdentity): FindOptionsWhere<SupportTicket> {
    if (identity.userId) return { user_id: identity.userId };
    if (identity.guestSession) return { guest_session: identity.guestSession };
    throw new HttpError(400, "Missing caller identity", "IDENTITY_REQUIRED");
  }

  // ─── Customer ────────────────────────────────────────────────────────────

  async createTicket(data: CreateTicketBody, identity: TicketIdentity) {
    if (!identity.userId && !identity.guestSession) {
      throw new HttpError(400, "Missing caller identity", "IDENTITY_REQUIRED");
    }
    if (!identity.userId && (!data.guest_email || !data.guest_name)) {
      throw new HttpError(400, "Guest name and email are required", "GUEST_CONTACT_REQUIRED");
    }

    const ticket = this.ticketRepo.create({
      ticket_number: generateTicketNumber(),
      user_id: identity.userId,
      guest_session: identity.userId ? null : identity.guestSession,
      guest_email: identity.userId ? null : (data.guest_email ?? null),
      guest_name: identity.userId ? null : (data.guest_name ?? null),
      subject: data.subject,
      category: data.category ?? null,
      order_id: data.order_id ?? null,
      status: TicketStatus.open,
      priority: TicketPriority.medium,
    });
    const saved = await this.ticketRepo.save(ticket);

    const msg = this.messageRepo.create({
      ticket_id: saved.id,
      sender_id: identity.userId,
      sender_role: "customer",
      message: data.message,
      attachment_urls: [],
      is_internal: false,
      origin: "app",
    });
    await this.messageRepo.save(msg);

    // The opening message must reach Slack too — it is what opens the thread.
    await this.relayToSlack(saved, data.message, "👤 Customer:", "app", false);

    return saved;
  }

  async listUserTickets(identity: TicketIdentity, query: TicketListQuery) {
    const { page = 1, limit = 20, status } = query;
    const where: FindOptionsWhere<SupportTicket> = this.ownerWhere(identity);
    if (status) where.status = status as TicketStatus;

    const [data, total] = await this.ticketRepo.findAndCount({
      where,
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async getUserTicket(ticketId: string, identity: TicketIdentity) {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId, ...this.ownerWhere(identity) },
    });
    if (!ticket) throw new HttpError(404, "Ticket not found", "TICKET_NOT_FOUND");

    // Filter out internal messages for customer view
    const messages = await this.messageRepo.find({
      where: { ticket_id: ticketId, is_internal: false },
      order: { created_at: "ASC" },
    });

    return { ...ticket, messages };
  }

  async addCustomerMessage(ticketId: string, identity: TicketIdentity, data: CreateMessageBody) {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId, ...this.ownerWhere(identity) },
    });
    if (!ticket) throw new HttpError(404, "Ticket not found", "TICKET_NOT_FOUND");

    if (ticket.status === TicketStatus.closed) {
      throw new HttpError(409, "Cannot reply to a closed ticket", "TICKET_CLOSED");
    }

    const msg = this.messageRepo.create({
      ticket_id: ticketId,
      sender_id: identity.userId,
      sender_role: "customer",
      message: data.message,
      attachment_urls: data.attachment_urls ?? [],
      is_internal: false,
      origin: "app",
    });
    const saved = await this.messageRepo.save(msg);

    await publishTicketMessage(ticketId, saved);
    await this.relayToSlack(ticket, data.message, "👤 Customer:", "app", false);

    // Update ticket status to open if it was waiting_customer
    if (ticket.status === TicketStatus.waiting_customer) {
      ticket.status = TicketStatus.open;
      await this.ticketRepo.save(ticket);
    }

    return saved;
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async listAllTickets(query: TicketListQuery) {
    const { page = 1, limit = 20, status, priority, assigned_to, date_from, date_to } = query;
    const qb = this.ticketRepo
      .createQueryBuilder("t")
      // Selective joins only — never expose sensitive User columns to the admin API.
      .leftJoin("t.user", "user")
      .addSelect(["user.id", "user.email", "user.first_name", "user.last_name"])
      .leftJoin("t.assignedToUser", "assignedToUser")
      .addSelect([
        "assignedToUser.id",
        "assignedToUser.email",
        "assignedToUser.first_name",
        "assignedToUser.last_name",
      ])
      .where("t.deleted_at IS NULL")
      .orderBy("t.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere("t.status = :status", { status });
    if (priority) qb.andWhere("t.priority = :priority", { priority });
    if (assigned_to) qb.andWhere("t.assigned_to = :assigned_to", { assigned_to });
    if (date_from) qb.andWhere("t.created_at >= :date_from", { date_from: new Date(date_from) });
    if (date_to) qb.andWhere("t.created_at <= :date_to", { date_to: new Date(date_to) });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getAdminTicket(ticketId: string) {
    const ticket = await this.ticketRepo
      .createQueryBuilder("t")
      // Selective joins only — never expose sensitive User columns to the admin API.
      .leftJoin("t.user", "user")
      .addSelect(["user.id", "user.email", "user.first_name", "user.last_name"])
      .leftJoin("t.assignedToUser", "assignedToUser")
      .addSelect([
        "assignedToUser.id",
        "assignedToUser.email",
        "assignedToUser.first_name",
        "assignedToUser.last_name",
      ])
      .leftJoin("t.order", "order")
      .addSelect(["order.id", "order.order_number"])
      .where("t.id = :id", { id: ticketId })
      .getOne();
    if (!ticket) throw new HttpError(404, "Ticket not found", "TICKET_NOT_FOUND");

    // Admin can see all messages including internal ones
    const messages = await this.messageRepo.find({
      where: { ticket_id: ticketId },
      order: { created_at: "ASC" },
    });

    return { ...ticket, messages };
  }

  async updateTicket(ticketId: string, data: UpdateTicketBody) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new HttpError(404, "Ticket not found", "TICKET_NOT_FOUND");

    if (data.status) ticket.status = data.status as TicketStatus;
    if (data.priority) ticket.priority = data.priority as TicketPriority;
    if (data.assigned_to !== undefined) ticket.assigned_to = data.assigned_to;

    if (data.status === TicketStatus.resolved && ticket.status !== TicketStatus.resolved) {
      ticket.resolved_at = new Date();
    }

    return this.ticketRepo.save(ticket);
  }

  async addAdminMessage(
    ticketId: string,
    adminId: string,
    adminRole: string,
    data: CreateMessageBody,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new HttpError(404, "Ticket not found", "TICKET_NOT_FOUND");

    const msg = this.messageRepo.create({
      ticket_id: ticketId,
      sender_id: adminId,
      sender_role: adminRole,
      message: data.message,
      attachment_urls: data.attachment_urls ?? [],
      is_internal: data.is_internal ?? false,
      origin: "app",
    });
    const saved = await this.messageRepo.save(msg);

    if (!data.is_internal) await publishTicketMessage(ticketId, saved);
    await this.relayToSlack(
      ticket,
      data.message,
      `🎧 ${adminRole}:`,
      "app",
      data.is_internal ?? false,
    );

    // Move to waiting_customer when admin replies (non-internal)
    if (!data.is_internal && ticket.status === TicketStatus.open) {
      ticket.status = TicketStatus.waiting_customer;
      await this.ticketRepo.save(ticket);
    }

    return saved;
  }

  // ─── Slack (inbound) ────────────────────────────────────────────────────────

  async findTicketBySlackThread(threadTs: string) {
    return this.ticketRepo.findOne({ where: { slack_thread_ts: threadTs } });
  }

  async addSlackAgentMessage(threadTs: string, text: string, slackAuthor: string) {
    const ticket = await this.findTicketBySlackThread(threadTs);
    if (!ticket) return null;
    if (ticket.status === TicketStatus.closed) return null;

    const msg = this.messageRepo.create({
      ticket_id: ticket.id,
      sender_id: null,
      sender_role: "agent",
      message: text,
      attachment_urls: [],
      is_internal: false,
      origin: "slack",
    });
    const saved = await this.messageRepo.save(msg);
    await publishTicketMessage(ticket.id, saved);

    if (ticket.status === TicketStatus.open) {
      ticket.status = TicketStatus.waiting_customer;
      await this.ticketRepo.save(ticket);
    }
    void slackAuthor; // reserved for future Slack-user attribution
    return saved;
  }
}
