import type { NewsletterSubscriber } from "@materialhub/database";
import type { INewsletterSubscriberRepository } from "../repositories/newsletter-subscriber.repository.ts";

export interface WelcomeEmailSender {
  sendNewsletterWelcomeEmail(
    to: string,
    params: { unsubscribeToken: string; locale?: string },
  ): Promise<void>;
}

export interface SubscribeInput {
  email: string;
  locale?: string;
  source?: string;
  userId?: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ??
    (err as { driverError?: { code?: string } })?.driverError?.code;
  return code === "23505";
}

export class NewsletterService {
  constructor(
    private readonly repo: INewsletterSubscriberRepository,
    private readonly email: WelcomeEmailSender,
  ) {}

  async subscribe(input: SubscribeInput): Promise<{ subscribed: true }> {
    const email = normalizeEmail(input.email);
    const existing = await this.repo.findByEmail(email);

    if (!existing) {
      try {
        const created = await this.repo.insert({
          email,
          locale: input.locale ?? "en",
          source: input.source ?? "homepage",
          user_id: input.userId ?? null,
        });
        await this.sendWelcome(created);
        return { subscribed: true };
      } catch (err) {
        // Lost a concurrent insert race — the partial-unique index rejected the
        // second insert. The winning request created the row (and sent the
        // welcome), so treat this as an idempotent success.
        if (isUniqueViolation(err) && (await this.repo.findByEmail(email))) {
          return { subscribed: true };
        }
        throw err;
      }
    }

    // Backfill user_id if we now know the account.
    const dirty = !!(input.userId && !existing.user_id);
    if (dirty) {
      existing.user_id = input.userId ?? null;
    }

    if (existing.unsubscribed_at) {
      existing.unsubscribed_at = null;
      const saved = await this.repo.save(existing);
      await this.sendWelcome(saved);
      return { subscribed: true };
    }

    // Already active — only persist if something actually changed.
    if (dirty) {
      await this.repo.save(existing);
    }
    return { subscribed: true };
  }

  async getStatusByEmail(rawEmail: string): Promise<{ subscribed: boolean }> {
    const existing = await this.repo.findByEmail(normalizeEmail(rawEmail));
    return { subscribed: !!existing && !existing.unsubscribed_at };
  }

  async unsubscribe(token: string): Promise<boolean> {
    const row = await this.repo.findByToken(token);
    if (!row) return false;
    if (!row.unsubscribed_at) {
      row.unsubscribed_at = new Date();
      await this.repo.save(row);
    }
    return true;
  }

  private async sendWelcome(row: NewsletterSubscriber): Promise<void> {
    try {
      await this.email.sendNewsletterWelcomeEmail(row.email, {
        unsubscribeToken: row.unsubscribe_token,
        locale: row.locale,
      });
    } catch {
      // Welcome-email failures must never fail the subscribe.
    }
  }
}
