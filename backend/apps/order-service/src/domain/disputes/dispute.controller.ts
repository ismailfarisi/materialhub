import type { DisputeService } from "./dispute.service.ts";

interface Actor {
  id: string;
  role: string;
}

interface PageQuery {
  page?: number;
  limit?: number;
}

export class DisputeController {
  constructor(private disputeService: DisputeService) {}

  async openDispute(orderId: string, userId: string, body: any) {
    return this.disputeService.openDispute(orderId, userId, body);
  }

  async assign(disputeId: string, adminId: string, body: any) {
    return this.disputeService.assignDispute(disputeId, adminId, body.assignee_id);
  }

  async escalate(disputeId: string, adminId: string) {
    return this.disputeService.escalateDispute(disputeId, adminId);
  }

  async resolve(disputeId: string, adminId: string, body: any) {
    return this.disputeService.resolveDispute(disputeId, adminId, body);
  }

  async close(disputeId: string, adminId: string) {
    return this.disputeService.closeDispute(disputeId, adminId);
  }

  /** Customer (own disputes only) or admin. Unknown/foreign id → 404. */
  async addMessage(disputeId: string, actor: Actor, body: any) {
    await this.disputeService.assertParticipant(disputeId, actor.id, actor.role);
    return this.disputeService.addMessage(disputeId, actor.id, actor.role, body);
  }

  /** Customer (own disputes only) or admin. Unknown/foreign id → 404. */
  async listMessages(disputeId: string, actor: Actor, query: PageQuery = {}) {
    await this.disputeService.assertParticipant(disputeId, actor.id, actor.role);
    const messages = await this.disputeService.getMessages(disputeId, actor.role);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const start = (page - 1) * limit;
    return {
      data: messages.slice(start, start + limit),
      total: messages.length,
      page,
      limit,
    };
  }

  async getMessages(disputeId: string, role: string) {
    return this.disputeService.getMessages(disputeId, role);
  }

  async listForBuyer(userId: string, query: any) {
    return this.disputeService.listForBuyer(userId, query);
  }

  async getForBuyer(disputeId: string, userId: string) {
    return this.disputeService.getForBuyer(disputeId, userId);
  }

  async listForAdmin(query: any) {
    return this.disputeService.listForAdmin(query);
  }
}
