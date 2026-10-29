import type { ShipmentTrackingService } from "./shipment-tracking.service.ts";

export class ShipmentTrackingController {
  constructor(private shipmentService: ShipmentTrackingService) {}

  async createShipment(vendorOrderId: string, vendorId: string, body: any) {
    return this.shipmentService.createShipment(vendorOrderId, vendorId, body);
  }

  async processWebhook(body: any) {
    return this.shipmentService.processWebhookEvent(body);
  }

  async getTracking(orderId: string, userId: string) {
    return this.shipmentService.getTrackingForOrder(orderId, userId);
  }

  async transitionStatus(
    shipmentId: string,
    actor: { userId: string; role: "vendor" | "admin" },
    body: { status: string; reason: string; metadata?: Record<string, unknown> },
  ) {
    return this.shipmentService.transitionShipmentStatus(
      shipmentId,
      actor,
      body.status as any,
      body.reason,
      body.metadata,
    );
  }

  async getHistory(shipmentId: string) {
    return this.shipmentService.getShipmentHistory(shipmentId);
  }

  async getEvents(shipmentId: string) {
    return this.shipmentService.getShipmentEvents(shipmentId);
  }
}
