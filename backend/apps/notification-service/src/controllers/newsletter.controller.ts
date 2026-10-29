import type { NewsletterSubscribeBody } from "@materialhub/dto";
import type { NewsletterService } from "../services/newsletter.service.ts";

export class NewsletterController {
  constructor(private readonly service: NewsletterService) {}

  subscribe(body: NewsletterSubscribeBody, userId: string | null) {
    return this.service.subscribe({
      email: body.email,
      locale: body.locale,
      source: body.source,
      userId,
    });
  }

  async status(userEmail: string | null): Promise<{ subscribed: boolean }> {
    if (!userEmail) return { subscribed: false };
    return this.service.getStatusByEmail(userEmail);
  }

  unsubscribe(token: string): Promise<boolean> {
    return this.service.unsubscribe(token);
  }
}
