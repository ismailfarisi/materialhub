import type { EmailService } from "@materialhub/utils";

export interface EmailDispatcher {
  send(to: string, subject: string, htmlBody: string): Promise<void>;
}

export class StubEmailDispatcher implements EmailDispatcher {
  async send(to: string, subject: string, _htmlBody: string): Promise<void> {
    console.log(`[StubEmail] To: ${to} | Subject: ${subject}`);
  }
}

/**
 * Real email transport for the notification dispatcher, backed by the shared
 * SES `EmailService`. Replaces the stub so in-app notification types that also
 * have email enabled (order_shipped, order_delivered, payout_sent, …) actually
 * deliver. Rich order-placed emails are sent separately via OrderEmailService.
 */
export class SesEmailDispatcher implements EmailDispatcher {
  constructor(private readonly emailService: EmailService) {}

  async send(to: string, subject: string, htmlBody: string): Promise<void> {
    await this.emailService.sendTransactional(to, subject, htmlBody);
  }
}
