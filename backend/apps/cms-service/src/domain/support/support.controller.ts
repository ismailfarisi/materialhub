import type {
  CreateMessageBody,
  CreateTicketBody,
  TicketListQuery,
  UpdateTicketBody,
} from "@materialhub/dto";
import type { SupportService, TicketIdentity } from "./support.service.ts";

export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ─── Customer ──────────────────────────────────────────────────────────────
  async createTicket(data: CreateTicketBody, identity: TicketIdentity) {
    return this.supportService.createTicket(data, identity);
  }
  async listUserTickets(identity: TicketIdentity, query: TicketListQuery) {
    return this.supportService.listUserTickets(identity, query);
  }
  async getUserTicket(ticketId: string, identity: TicketIdentity) {
    return this.supportService.getUserTicket(ticketId, identity);
  }
  async addCustomerMessage(ticketId: string, identity: TicketIdentity, data: CreateMessageBody) {
    return this.supportService.addCustomerMessage(ticketId, identity, data);
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────
  async listAllTickets(query: TicketListQuery) {
    return this.supportService.listAllTickets(query);
  }
  async getAdminTicket(ticketId: string) {
    return this.supportService.getAdminTicket(ticketId);
  }
  async updateTicket(ticketId: string, data: UpdateTicketBody) {
    return this.supportService.updateTicket(ticketId, data);
  }
  async addAdminMessage(
    ticketId: string,
    adminId: string,
    adminRole: string,
    data: CreateMessageBody,
  ) {
    return this.supportService.addAdminMessage(ticketId, adminId, adminRole, data);
  }

  // ─── Slack (inbound) ────────────────────────────────────────────────────────
  async addSlackAgentMessage(threadTs: string, text: string, slackAuthor: string) {
    return this.supportService.addSlackAgentMessage(threadTs, text, slackAuthor);
  }
}
