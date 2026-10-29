import type { CartAbandonmentService } from "./cart-abandonment.service.ts";

export class CartAbandonmentController {
  constructor(private readonly service: CartAbandonmentService) {}

  async getStats() {
    return this.service.getStats();
  }
}
