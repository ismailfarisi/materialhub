import { AppDataSource, NewsletterSubscriber } from "@materialhub/database";

export interface INewsletterSubscriberRepository {
  findByEmail(email: string): Promise<NewsletterSubscriber | null>;
  findByToken(token: string): Promise<NewsletterSubscriber | null>;
  insert(data: Partial<NewsletterSubscriber>): Promise<NewsletterSubscriber>;
  save(entity: NewsletterSubscriber): Promise<NewsletterSubscriber>;
}

export class NewsletterSubscriberRepository implements INewsletterSubscriberRepository {
  private get repo() {
    return AppDataSource.getRepository(NewsletterSubscriber);
  }

  // Non-deleted row for this email (active OR previously unsubscribed).
  findByEmail(email: string): Promise<NewsletterSubscriber | null> {
    return this.repo.findOne({ where: { email } });
  }

  findByToken(token: string): Promise<NewsletterSubscriber | null> {
    return this.repo.findOne({ where: { unsubscribe_token: token } });
  }

  async insert(data: Partial<NewsletterSubscriber>): Promise<NewsletterSubscriber> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  save(entity: NewsletterSubscriber): Promise<NewsletterSubscriber> {
    return this.repo.save(entity);
  }
}
