import type { DisputeService } from "./dispute.service.ts";

export class DisputeController {
  constructor(private disputeService: DisputeService) {}

  async open(orderId: string, userId: string, body: any) {
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

  async addMessage(disputeId: string, senderId: string, senderRole: string, body: any) {
    return this.disputeService.addMessage(disputeId, senderId, senderRole, body);
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
